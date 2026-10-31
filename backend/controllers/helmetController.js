const HelmetEvent = require('../models/HelmetEvent')
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
  const query = {}

  if (req.user.role === 'citizen') {
    query.rider = req.user._id
  } else if (
    !['dispatcher', 'admin', 'hospital_admin'].includes(req.user.role)
  ) {
    throw new ApiError(403, 'Not authorized to view helmet events')
  }

  const events = await HelmetEvent.find(query)
    .populate('rider', 'name email phone')
    .populate('emergency', 'type severity status')
    .sort({ createdAt: -1 })
    .limit(100)

  res.json(new ApiResponse(200, events))
})

// GET /api/helmet/stats
const getHelmetStats = asyncHandler(async (req, res) => {
  const match =
    req.user.role === 'citizen'
      ? { rider: req.user._id }
      : {}

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [total, crashes, last24h, newEvents] = await Promise.all([
    HelmetEvent.countDocuments(match),
    HelmetEvent.countDocuments({
      ...match,
      'prediction.isCrash': true
    }),
    HelmetEvent.countDocuments({
      ...match,
      createdAt: { $gte: since }
    }),
    HelmetEvent.countDocuments({
      ...match,
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
    await Emergency.findOneAndUpdate(
      {
        _id: event.emergency,
        status: { $in: ['pending', 'dispatched'] }
      },
      { status: 'cancelled' }
    )
  }

  await event.save()

  res.json(
    new ApiResponse(200, event, 'Helmet event updated')
  )
})

module.exports = {
  deviceOrUser,
  createHelmetEvent,
  listHelmetEvents,
  getHelmetStats,
  updateHelmetEventStatus
}