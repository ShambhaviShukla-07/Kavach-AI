const crypto = require('crypto')
const mongoose = require('mongoose')
const Emergency = require('../models/Emergency')
const HelmetDevice = require('../models/HelmetDevice')
const User = require('../models/User')
const ApiError = require('../utils/ApiError')
const ApiResponse = require('../utils/ApiResponse')
const asyncHandler = require('../utils/asyncHandler')
const { getIO } = require('../config/socket')

const LOCATION_MAX_AGE_MS = 24 * 60 * 60 * 1000

const authenticateDevice = (req, res, next) => {
  const expected = process.env.HELMET_DEVICE_KEY
  const supplied = req.headers['x-device-token'] || req.headers['x-device-key']

  if (!expected) {
    return next(new ApiError(503, 'Helmet device authentication is not configured'))
  }

  const expectedBuffer = Buffer.from(expected)
  const suppliedBuffer = typeof supplied === 'string'
    ? Buffer.from(supplied)
    : Buffer.alloc(0)
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return next(new ApiError(401, 'Invalid helmet device token'))
  }

  return next()
}

const deviceIdFromRequest = (req) => {
  const deviceId = String(req.params.deviceId || '').trim()
  if (!deviceId || deviceId.length > 64) {
    throw new ApiError(400, 'Invalid deviceId')
  }

  return deviceId
}

const getDeviceState = (deviceId) =>
  HelmetDevice.findOne({ deviceId })

const parseCoordinates = (latitude, longitude) => {
  if (
    latitude === undefined || latitude === null || latitude === '' ||
    longitude === undefined || longitude === null || longitude === ''
  ) {
    return null
  }

  const lat = Number(latitude)
  const lng = Number(longitude)
  if (
    !Number.isFinite(lat) || lat < -90 || lat > 90 ||
    !Number.isFinite(lng) || lng < -180 || lng > 180
  ) {
    return null
  }

  return { latitude: lat, longitude: lng }
}

const updateLocation = asyncHandler(async (req, res) => {
  const deviceId = deviceIdFromRequest(req)
  const coordinates = req.body.gps_valid
    ? parseCoordinates(req.body.latitude, req.body.longitude)
    : null

  if (!coordinates) {
    throw new ApiError(400, 'Valid GPS coordinates are required')
  }

  const speedKmh = Number(req.body.speed_kmh)
  const location = {
    ...coordinates,
    speedKmh: Number.isFinite(speedKmh) && speedKmh >= 0 ? speedKmh : null,
    recordedAt: new Date()
  }

  await HelmetDevice.findOneAndUpdate(
    { deviceId },
    {
      $set: { location },
      $inc: { gpsPointCount: 1 },
      $push: { locationHistory: { $each: [location], $slice: -50 } }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  res.json(new ApiResponse(200, { deviceId, location }, 'Device location updated'))
})

const getLatestLocation = asyncHandler(async (req, res) => {
  const deviceId = deviceIdFromRequest(req)
  const device = await getDeviceState(deviceId)
  const location = device?.location
  const isUsable = Boolean(
    location?.recordedAt &&
    Date.now() - new Date(location.recordedAt).getTime() <= LOCATION_MAX_AGE_MS
  )

  res.json({
    gps_valid: isUsable,
    latitude: isUsable ? location.latitude : null,
    longitude: isUsable ? location.longitude : null,
    recorded_at: isUsable ? location.recordedAt.toISOString() : null
  })
})

const updateBuzzerStatus = asyncHandler(async (req, res) => {
  const deviceId = deviceIdFromRequest(req)
  if (typeof req.body.buzzer_active !== 'boolean') {
    throw new ApiError(400, 'buzzer_active must be a boolean')
  }

  await HelmetDevice.findOneAndUpdate(
    { deviceId },
    { $set: { buzzerActive: req.body.buzzer_active } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  res.json(new ApiResponse(200, { deviceId }, 'Buzzer status updated'))
})

const createDeviceIncident = asyncHandler(async (req, res) => {
  const deviceId = deviceIdFromRequest(req)
  const eventId = String(req.body.event_id || '').trim()
  const details = String(req.body.details || 'Helmet SOS').trim().slice(0, 500)

  if (!eventId || eventId.length > 120) {
    throw new ApiError(400, 'A valid event_id is required')
  }

  const existing = await Emergency.findOne({ deviceEventId: eventId })
  if (existing) {
    return res.json(new ApiResponse(200, existing, 'Device incident already recorded'))
  }

  const riderId = process.env.HELMET_DEVICE_USER_ID
  let rider = null
  if (riderId && mongoose.isValidObjectId(riderId)) {
    const candidate = await User.findById(riderId)
    if (candidate?.role === 'citizen') rider = candidate
  }
  if (!rider) {
    console.warn('HELMET_DEVICE_USER_ID is not a valid citizen; recording SOS without a rider')
  }

  let coordinates = parseCoordinates(req.body.latitude, req.body.longitude)
  let recordedAt = new Date()

  if (!coordinates) {
    const device = await getDeviceState(deviceId)
    const savedLocation = device?.location
    const age = savedLocation?.recordedAt
      ? Date.now() - new Date(savedLocation.recordedAt).getTime()
      : Infinity

    if (age <= LOCATION_MAX_AGE_MS) {
      coordinates = parseCoordinates(savedLocation.latitude, savedLocation.longitude)
      recordedAt = savedLocation.recordedAt
    }
  }

  const emergency = await Emergency.create({
    citizen: rider?._id || null,
    type: 'accident',
    severity: /severe|continuous|violent/i.test(details) ? 'critical' : 'high',
    description: `Helmet ${deviceId} SOS: ${details}`,
    deviceId,
    deviceEventId: eventId,
    statusHistory: [{
      status: 'pending',
      changedAt: new Date(),
      changedBy: null,
      source: 'helmet'
    }],
    location: coordinates
      ? {
        type: 'Point',
        coordinates: [coordinates.longitude, coordinates.latitude],
        mapsUrl: `https://maps.google.com/?q=${coordinates.latitude},${coordinates.longitude}`,
        locationTimestamp: recordedAt
      }
      : {
        type: 'Point',
        coordinates: [0, 0],
        address: 'Location unavailable',
        locationTimestamp: null
      }
  })

  try {
    getIO().emit('new_emergency', emergency)
  } catch (error) {
    // Socket.io may not be initialized in tests.
  }

  res.status(201).json(new ApiResponse(201, emergency, 'Helmet SOS recorded'))
})

const recordSmsStatus = asyncHandler(async (req, res) => {
  const deviceId = deviceIdFromRequest(req)
  const eventId = String(req.body.event_id || '').trim()
  const contactIndex = Number(req.body.contact_index)
  const status = req.body.status

  if (!eventId || eventId.length > 120) {
    throw new ApiError(400, 'A valid event_id is required')
  }
  if (!Number.isInteger(contactIndex) || contactIndex < 1 || contactIndex > 3) {
    throw new ApiError(400, 'contact_index must be between 1 and 3')
  }
  if (!['SENT', 'FAILED'].includes(status)) {
    throw new ApiError(400, 'status must be SENT or FAILED')
  }

  const result = {
    eventId,
    contactIndex,
    contactNumber: String(req.body.contact_number || '').slice(0, 32),
    status,
    modemResponse: String(req.body.modem_response || '').slice(0, 500),
    receivedAt: new Date()
  }

  const device = await HelmetDevice.findOneAndUpdate(
    { deviceId },
    { $setOnInsert: { deviceId }, $pull: { smsResults: { eventId, contactIndex } } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
  device.smsResults.push(result)
  device.smsResults = device.smsResults.slice(-100)
  await device.save()

  res.json(new ApiResponse(200, { deviceId, eventId, contactIndex }, 'SMS status recorded'))
})

module.exports = {
  authenticateDevice,
  updateLocation,
  getLatestLocation,
  updateBuzzerStatus,
  createDeviceIncident,
  recordSmsStatus
}