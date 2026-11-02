const HelmetEvent = require('../models/HelmetEvent')
const HelmetDevice = require('../models/HelmetDevice')
const Emergency = require('../models/Emergency')
const User = require('../models/User')
const ApiError = require('../utils/ApiError')
const ApiResponse = require('../utils/ApiResponse')
const asyncHandler = require('../utils/asyncHandler')
const { protect } = require('../middlewares/authMiddleware')
const { getIO } = require('../config/socket')

const AI_SERVICE_URL =
  process.env.AI_SERVICE_URL || 'http://127.0.0.1:8010'

const FEATURE_KEYS = [
  'peak_accel_g',
  'mean_accel_g',
  'std_accel_g',
  'peak_gyro_dps',
  'mean_gyro_dps',
  'jerk_g_s',
  'impact_duration_ms',
  'post_impact_stillness'
]

const safeEmit = (event, payload) => {
  try {
    getIO().emit(event, payload)
  } catch (error) {
    // Socket.io may not be initialised in tests.
  }
}

const deviceOrUser = asyncHandler(async (req, res, next) => {
  const key = req.headers['x-device-key']
  const expected = process.env.HELMET_DEVICE_KEY

  if (expected && key && key === expected) {
    req.isDevice = true
    return next()
  }

  return protect(req, res, next)
})

const normaliseFeatures = (input) => {
  if (!input || typeof input !== 'object') {
    throw new ApiError(400, 'features object is required')
  }

  const features = {}

  for (const key of FEATURE_KEYS) {
    const raw = input[key]
    if (raw === undefined || raw === null || raw === '') {
      throw new ApiError(400, `features.${key} is required`)
    }

    const value = Number(raw)
    if (!Number.isFinite(value) || value < 0) {
      throw new ApiError(
        400,
        `features.${key} must be a non-negative number`
      )
    }

    features[key] = value
  }

  return features
}

const parseCoordinates = (lat, lng) => {
  if (lat === undefined || lng === undefined) return null

  const latitude = Number(lat)
  const longitude = Number(lng)

  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90
  ) {
    throw new ApiError(400, 'Invalid latitude')
  }

  if (
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new ApiError(400, 'Invalid longitude')
  }

  return { latitude, longitude }
}

// POST /api/helmet/events
const createHelmetEvent = asyncHandler(async (req, res) => {
  const { deviceId, riderId, lat, lng, address, features } = req.body

  if (!deviceId) {
    throw new ApiError(400, 'deviceId is required')
  }

  const cleanFeatures = normaliseFeatures(features)
  const coordinates = parseCoordinates(lat, lng)

  const aiResponse = await fetch(`${AI_SERVICE_URL}/helmet/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      device_id: deviceId,
      features: cleanFeatures
    })
  })

  if (!aiResponse.ok) {
    const body = await aiResponse.text()
    throw new ApiError(
      503,
      `AI service failed: ${body.slice(0, 200)}`
    )
  }

  const prediction = await aiResponse.json()

  let rider = null
  const riderCandidate = riderId || req.user?._id

  if (riderCandidate) {
    rider = await User.findById(riderCandidate)
    if (!rider) throw new ApiError(404, 'Rider not found')
  }

  let emergency = null

  if (prediction.is_crash && rider && coordinates) {
    emergency = await Emergency.create({
      citizen: rider._id,
      type: 'accident',
      severity: prediction.severity,
      description:
        `Helmet crash detected with ` +
        `${Math.round(prediction.confidence * 100)}% confidence`,
      location: {
        type: 'Point',
        coordinates: [
          coordinates.longitude,
          coordinates.latitude
        ],
        address: address || ''
      }
    })

    safeEmit('new_emergency', emergency)
  }

  const event = await HelmetEvent.create({
    deviceId,
    rider: rider?._id || null,
    location: coordinates
      ? {
          lat: coordinates.latitude,
          lng: coordinates.longitude,
          address: address || ''
        }
      : {},
    features: cleanFeatures,
    prediction: {
      isCrash: prediction.is_crash,
      confidence: prediction.confidence,
      severity: prediction.severity,
      modelVersion: prediction.model_version,
      reasons: prediction.reasons
    },
    emergency: emergency?._id || null,
    source: req.isDevice ? 'helmet' : 'simulation'
  })

  safeEmit('new_helmet_event', event)

  res.status(201).json(
    new ApiResponse(
      201,
      { event, emergency, prediction },
      'Helmet event processed'
    )
  )
})

// GET /api/helmet/events
const listHelmetEvents = asyncHandler(async (req, res) => {
  const events = await HelmetEvent.find({})
    .populate('rider', 'name email phone')
    .populate('emergency', 'type severity status')
    .sort({ createdAt: -1 })
    .limit(100)

  res.json(new ApiResponse(200, events))
})

// GET /api/helmet/stats
const getHelmetStats = asyncHandler(async (req, res) => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [total, crashes, last24h, newEvents] = await Promise.all([
    HelmetEvent.countDocuments({}),
    HelmetEvent.countDocuments({
      'prediction.isCrash': true
    }),
    HelmetEvent.countDocuments({
      createdAt: { $gte: since }
    }),
    HelmetEvent.countDocuments({
      status: 'new'
    })
  ])

  res.json(
    new ApiResponse(200, { total, crashes, last24h, newEvents })
  )
})

// PATCH /api/helmet/events/:id/status
const updateHelmetEventStatus = asyncHandler(async (req, res) => {
  const allowed = [
    'new',
    'acknowledged',
    'false_alarm',
    'dispatched'
  ]

  if (!allowed.includes(req.body.status)) {
    throw new ApiError(400, 'Invalid helmet event status')
  }

  const event = await HelmetEvent.findById(req.params.id)

  if (!event) {
    throw new ApiError(404, 'Helmet event not found')
  }

  event.status = req.body.status

  if (event.status === 'false_alarm' && event.emergency) {
    const emergency = await Emergency.findOne({
      _id: event.emergency,
      status: { $in: ['pending', 'acknowledged', 'dispatched'] }
    })

    if (emergency) {
      emergency.status = 'cancelled'
      emergency.statusHistory.push({
        status: 'cancelled',
        changedBy: req.user._id,
        source: 'admin'
      })
      await emergency.save()
    }
  }

  await event.save()

  res.json(
    new ApiResponse(200, event, 'Helmet event updated')
  )
})

const DEVICE_ONLINE_WINDOW_MS = 60 * 1000

// GET /api/helmet/device
const getHelmetDeviceStatus = asyncHandler(async (req, res) => {
  const incidentQuery = { deviceId: { $ne: null } }

  const [devices, incidents, openEmergencies] = await Promise.all([
    HelmetDevice.find().sort({ updatedAt: -1 }).limit(20),
    Emergency.find(incidentQuery)
      .populate('citizen', 'name phone')
      .populate('statusHistory.changedBy', 'name email role')
      .sort({ createdAt: -1 })
      .limit(100),
    Emergency.countDocuments({
      ...incidentQuery,
      status: { $nin: ['resolved', 'cancelled'] }
    })
  ])

  const now = Date.now()

  res.json(
    new ApiResponse(200, {
      summary: {
        registeredHelmets: devices.length,
        openEmergencies,
        smsLogRecords: devices.reduce(
          (total, device) => total + device.smsResults.length,
          0
        )
      },
      devices: devices.map((device) => ({
        deviceId: device.deviceId,
        online: now - device.updatedAt.getTime() < DEVICE_ONLINE_WINDOW_MS,
        lastSeen: device.updatedAt,
        location: device.location,
        gpsPoints: device.gpsPointCount,
        buzzerActive: device.buzzerActive,
        smsResults: device.smsResults.slice(-50).reverse()
      })),
      incidents
    })
  )
})

module.exports = {
  deviceOrUser,
  createHelmetEvent,
  listHelmetEvents,
  getHelmetStats,
  updateHelmetEventStatus,
  getHelmetDeviceStatus
}