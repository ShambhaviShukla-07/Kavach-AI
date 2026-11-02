
const Emergency = require('../models/Emergency')
const Ambulance = require('../models/Ambulance')
const ApiError = require('../utils/ApiError')
const ApiResponse = require('../utils/ApiResponse')
const asyncHandler = require('../utils/asyncHandler')
const Notification = require('../models/Notification')
const Hospital = require('../models/Hospital')
const { getIO } = require('../config/socket')

const VALID_STATUSES = [
  'pending',
  'acknowledged',
  'dispatched',
  'en_route',
  'arrived',
  'resolved',
  'cancelled'
]

const emitEmergencyUpdate = (event, data) => {
  try {
    const { getIO } = require('../config/socket')
    getIO().emit(event, data)
  } catch (error) {
    // Socket connection may not be initialized.
  }
}

// POST /api/emergency
const createEmergency = asyncHandler(async (req, res) => {
  const { type, severity, description, coordinates, address } = req.body

  if (!Array.isArray(coordinates) || coordinates.length !== 2) {
    throw new ApiError(400, 'Valid location coordinates required')
  }

  const [longitude, latitude] = coordinates

  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    throw new ApiError(400, 'Invalid longitude or latitude')
  }

  const emergency = await Emergency.create({
    citizen: req.user._id,
    type,
    severity: severity || 'high',
    description: description || '',
    statusHistory: [{
      status: 'pending',
      changedBy: req.user._id,
      source: 'citizen'
    }],
    location: {
      type: 'Point',
      coordinates: [longitude, latitude],
      address: address || ''
    }
  })

  emitEmergencyUpdate('new_emergency', emergency)

  res.status(201).json(
    new ApiResponse(201, emergency, 'Emergency request created')
  )
})

// GET /api/emergency
const getEmergencies = asyncHandler(async (req, res) => {
  const query = {}

  if (req.user.role === 'citizen') {
    query.citizen = req.user._id
  } else if (req.user.role === 'driver') {
    query.assignedDriver = req.user._id
  } else if (req.user.role === 'hospital_admin') {
    const hospitals = await Hospital.find({ admin: req.user._id }).select('_id')
    query.assignedHospital = { $in: hospitals.map((h) => h._id) }
  } else if (!['dispatcher', 'admin'].includes(req.user.role)) {
    throw new ApiError(403, 'Not authorized to view these emergencies')
  }

  const emergencies = await Emergency.find(query)
    .populate('citizen', 'name phone')
    .populate('assignedAmbulance', 'vehicleNumber status')
    .populate('assignedDriver', 'name phone')
    .populate('assignedHospital', 'name address phone')
    .sort({ createdAt: -1 })

  res.json(new ApiResponse(200, emergencies))
})

// GET /api/emergency/:id
const getEmergencyById = asyncHandler(async (req, res) => {
  const emergency = await Emergency.findById(req.params.id)
    .populate('citizen', 'name phone email')
    .populate('assignedAmbulance')
    .populate('assignedDriver', 'name phone')
    .populate('assignedHospital', 'name address phone')

  if (!emergency) {
    throw new ApiError(404, 'Emergency not found')
  }

  const isDispatcher = ['dispatcher', 'admin'].includes(req.user.role)
  const isCitizen =
    req.user.role === 'citizen' &&
    String(emergency.citizen?._id || emergency.citizen) === String(req.user._id)
  const isDriver =
    req.user.role === 'driver' &&
    String(emergency.assignedDriver?._id || emergency.assignedDriver) ===
      String(req.user._id)

  if (!isDispatcher && !isCitizen && !isDriver) {
    throw new ApiError(403, 'Not authorized to view this emergency')
  }

  res.json(new ApiResponse(200, emergency))
})

// PUT /api/emergency/:id/dispatch
const dispatchEmergency = asyncHandler(async (req, res) => {
  const { ambulanceId, hospitalId, driverId } = req.body

  if (!ambulanceId) {
    throw new ApiError(400, 'Please select an ambulance')
  }

  const emergency = await Emergency.findById(req.params.id)

  if (!emergency) {
    throw new ApiError(404, 'Emergency not found')
  }

  if (['resolved', 'cancelled'].includes(emergency.status)) {
    throw new ApiError(400, 'This emergency is already closed')
  }

  const ambulance = await Ambulance.findById(ambulanceId)

  if (!ambulance) {
    throw new ApiError(404, 'Ambulance not found')
  }

  if (
    ambulance.status !== 'available' &&
    String(ambulance.currentEmergency || '') !== String(emergency._id)
  ) {
    throw new ApiError(400, 'Selected ambulance is not available')
  }

  if (driverId && ambulance.driver &&
      String(ambulance.driver) !== String(driverId)) {
    throw new ApiError(
      400,
      'Selected driver does not match the ambulance assigned driver'
    )
  }

  emergency.status = 'dispatched'
  emergency.statusHistory.push({
    status: 'dispatched',
    changedBy: req.user._id,
    source: req.user.role === 'admin' ? 'admin' : 'dispatcher'
  })
  emergency.assignedAmbulance = ambulance._id
  emergency.assignedDriver = driverId || ambulance.driver || null
  emergency.assignedHospital = hospitalId || null
  emergency.dispatcher = req.user._id

  await emergency.save()

  ambulance.status = 'dispatched'
  ambulance.currentEmergency = emergency._id
  await ambulance.save()

  const updated = await Emergency.findById(emergency._id)
    .populate('citizen', 'name phone')
    .populate('assignedAmbulance', 'vehicleNumber status')
    .populate('assignedDriver', 'name phone')
    .populate('assignedHospital', 'name address phone')

  emitEmergencyUpdate('emergency_updated', updated)

  res.json(new ApiResponse(200, updated, 'Ambulance dispatched successfully'))
})

// PUT /api/emergency/:id/status
const updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body

  if (!VALID_STATUSES.includes(status)) {
    throw new ApiError(400, 'Invalid emergency status')
  }

  const emergency = await Emergency.findById(req.params.id)

  if (!emergency) {
    throw new ApiError(404, 'Emergency not found')
  }

  const isDispatcher = ['dispatcher', 'admin'].includes(req.user.role)
  const isAssignedDriver =
    req.user.role === 'driver' &&
    String(emergency.assignedDriver || '') === String(req.user._id)

  if (!isDispatcher && !isAssignedDriver) {
    throw new ApiError(403, 'Not authorized to update this emergency')
  }

  if (['resolved', 'cancelled'].includes(emergency.status)) {
    throw new ApiError(400, 'This emergency is already closed')
  }

  const allowedTransitions = emergency.deviceId
    ? {
      pending: ['acknowledged', 'cancelled'],
      acknowledged: ['resolved', 'cancelled'],
      dispatched: ['en_route', 'arrived', 'resolved', 'cancelled'],
      en_route: ['arrived', 'resolved', 'cancelled'],
      arrived: ['resolved', 'cancelled']
    }
    : {
      pending: ['acknowledged', 'dispatched', 'resolved', 'cancelled'],
      acknowledged: ['dispatched', 'resolved', 'cancelled'],
      dispatched: ['en_route', 'arrived', 'resolved', 'cancelled'],
      en_route: ['arrived', 'resolved', 'cancelled'],
      arrived: ['resolved', 'cancelled']
    }

  if (!allowedTransitions[emergency.status]?.includes(status)) {
    throw new ApiError(
      400,
      `Cannot change status from ${emergency.status} to ${status}`
    )
  }

  // Drivers can only update the progress of their assigned emergency.
  if (!isDispatcher && !['en_route', 'arrived', 'resolved'].includes(status)) {
    throw new ApiError(403, 'Drivers cannot perform this status update')
  }

  emergency.status = status
  emergency.statusHistory.push({
    status,
    changedBy: req.user._id,
    source: req.user.role === 'admin' ? 'admin' : req.user.role
  })

  if (status === 'resolved') {
    emergency.resolvedAt = new Date()
  }

  await emergency.save()

  if (emergency.assignedAmbulance) {
    const ambulance = await Ambulance.findById(emergency.assignedAmbulance)

    if (ambulance) {
      if (status === 'resolved' || status === 'cancelled') {
        ambulance.status = 'available'
        ambulance.currentEmergency = null
        ambulance.totalTrips = (ambulance.totalTrips || 0) + 1
      } else if (status === 'en_route') {
        ambulance.status = 'en_route'
      } else if (status === 'arrived') {
        ambulance.status = 'at_scene'
      }

      await ambulance.save()
    }
  }
  if (status === 'dispatched') {
    try {
      const notification = await Notification.create({
        user: emergency.citizen,
        title: 'Ambulance Assigned',
        message: 'An ambulance has been assigned to your emergency request.',
        type: 'dispatch',
        link: '/citizen/dashboard'
      })

      getIO()
        .to(`user_${emergency.citizen}`)
        .emit('new_notification', notification)
    } catch (error) {
      console.error('Notification creation failed:', error.message)
    }
  }


  const updated = await Emergency.findById(emergency._id)
    .populate('citizen', 'name phone')
    .populate('statusHistory.changedBy', 'name email role')
    .populate('assignedAmbulance', 'vehicleNumber status')
    .populate('assignedDriver', 'name phone')
    .populate('assignedHospital', 'name address phone')

  emitEmergencyUpdate('emergency_updated', updated)

  res.json(new ApiResponse(200, updated, 'Emergency status updated'))
})

// GET /api/emergency/stats
const getStats = asyncHandler(async (req, res) => {
  const [total, pending, resolved, active, byType] = await Promise.all([
    Emergency.countDocuments(),
    Emergency.countDocuments({ status: 'pending' }),
    Emergency.countDocuments({ status: 'resolved' }),
    Emergency.countDocuments({
      status: { $in: ['dispatched', 'en_route', 'arrived'] }
    }),
    Emergency.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ])
  ])

  res.json(
    new ApiResponse(200, { total, pending, resolved, active, byType })
  )
})

module.exports = {
  createEmergency,
  getEmergencies,
  getEmergencyById,
  dispatchEmergency,
  updateStatus,
  getStats
}

