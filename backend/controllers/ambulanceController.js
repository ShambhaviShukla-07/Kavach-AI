
const mongoose = require('mongoose')
const Ambulance = require('../models/Ambulance')
const ApiError = require('../utils/ApiError')
const ApiResponse = require('../utils/ApiResponse')
const asyncHandler = require('../utils/asyncHandler')

// GET /api/ambulance
const getAmbulances = asyncHandler(async (req, res) => {
  const ambulances = await Ambulance.find()
    .populate('driver', 'name phone email role')
    .populate('currentEmergency', 'type severity status location')
    .sort({ createdAt: -1 })

  res.json(new ApiResponse(200, ambulances))
})

// POST /api/ambulance
const createAmbulance = asyncHandler(async (req, res) => {
  const { vehicleNumber, driver, fuelLevel, healthScore } = req.body

  if (!vehicleNumber || !vehicleNumber.trim()) {
    throw new ApiError(400, 'Vehicle number is required')
  }

  const ambulanceData = {
    vehicleNumber: vehicleNumber.trim().toUpperCase()
  }

  if (driver) {
    if (!mongoose.isValidObjectId(driver)) {
      throw new ApiError(400, 'Invalid driver ID')
    }

    const User = require('../models/User')
    const driverUser = await User.findById(driver)

    if (!driverUser || driverUser.role !== 'driver') {
      throw new ApiError(400, 'Please select a valid driver')
    }

    ambulanceData.driver = driver
  }

  if (fuelLevel !== undefined) {
    const value = Number(fuelLevel)

    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new ApiError(400, 'Fuel level must be between 0 and 100')
    }

    ambulanceData.fuelLevel = value
  }

  if (healthScore !== undefined) {
    const value = Number(healthScore)

    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new ApiError(400, 'Health score must be between 0 and 100')
    }

    ambulanceData.healthScore = value
  }

  const existing = await Ambulance.findOne({
    vehicleNumber: ambulanceData.vehicleNumber
  })

  if (existing) {
    throw new ApiError(409, 'This vehicle number already exists')
  }

  const ambulance = await Ambulance.create(ambulanceData)

  res.status(201).json(
    new ApiResponse(201, ambulance, 'Ambulance added successfully')
  )
})

// PUT /api/ambulance/:id
const updateAmbulance = asyncHandler(async (req, res) => {
  const ambulance = await Ambulance.findById(req.params.id)

  if (!ambulance) {
    throw new ApiError(404, 'Ambulance not found')
  }

  const { vehicleNumber, driver, status, fuelLevel, healthScore } = req.body

  if (vehicleNumber !== undefined) {
    if (!vehicleNumber.trim()) {
      throw new ApiError(400, 'Vehicle number cannot be empty')
    }

    const normalizedNumber = vehicleNumber.trim().toUpperCase()

    const duplicate = await Ambulance.findOne({
      vehicleNumber: normalizedNumber,
      _id: { $ne: ambulance._id }
    })

    if (duplicate) {
      throw new ApiError(409, 'This vehicle number already exists')
    }

    ambulance.vehicleNumber = normalizedNumber
  }

  if (driver !== undefined) {
    if (driver === null || driver === '') {
      ambulance.driver = null
    } else {
      if (!mongoose.isValidObjectId(driver)) {
        throw new ApiError(400, 'Invalid driver ID')
      }

      const User = require('../models/User')
      const driverUser = await User.findById(driver)

      if (!driverUser || driverUser.role !== 'driver') {
        throw new ApiError(400, 'Please select a valid driver')
      }

      ambulance.driver = driver
    }
  }

  if (fuelLevel !== undefined) {
    const value = Number(fuelLevel)

    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new ApiError(400, 'Fuel level must be between 0 and 100')
    }

    ambulance.fuelLevel = value
  }

  if (healthScore !== undefined) {
    const value = Number(healthScore)

    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new ApiError(400, 'Health score must be between 0 and 100')
    }

    ambulance.healthScore = value
  }

  const allowedStatuses = [
    'available',
    'dispatched',
    'en_route',
    'at_scene',
    'returning',
    'maintenance'
  ]

  if (status !== undefined) {
    if (!allowedStatuses.includes(status)) {
      throw new ApiError(400, 'Invalid ambulance status')
    }

    // Do not manually release an ambulance with an active emergency.
    if (
      status === 'available' &&
      ambulance.currentEmergency
    ) {
      throw new ApiError(
        400,
        'Resolve or cancel the current emergency before releasing this ambulance'
      )
    }

    ambulance.status = status
  }

  await ambulance.save()

  const updated = await Ambulance.findById(ambulance._id)
    .populate('driver', 'name phone email role')
    .populate('currentEmergency', 'type severity status location')

  res.json(new ApiResponse(200, updated, 'Ambulance updated successfully'))
})

// PUT /api/ambulance/:id/location
const updateLocation = asyncHandler(async (req, res) => {
  const { coordinates } = req.body

  if (
    !Array.isArray(coordinates) ||
    coordinates.length !== 2 ||
    !Number.isFinite(coordinates[0]) ||
    !Number.isFinite(coordinates[1])
  ) {
    throw new ApiError(
      400,
      'Coordinates must be [longitude, latitude]'
    )
  }

  const [longitude, latitude] = coordinates

  if (
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    throw new ApiError(400, 'Invalid location coordinates')
  }

  const ambulance = await Ambulance.findById(req.params.id)

  if (!ambulance) {
    throw new ApiError(404, 'Ambulance not found')
  }

  // Only the assigned driver or dispatcher may update this location.
  const isDispatcher = ['dispatcher', 'admin'].includes(req.user.role)
  const isAssignedDriver =
    req.user.role === 'driver' &&
    String(ambulance.driver || '') === String(req.user._id)

  if (!isDispatcher && !isAssignedDriver) {
    throw new ApiError(403, 'Not authorized to update this location')
  }

  ambulance.location = {
    type: 'Point',
    coordinates: [longitude, latitude]
  }

  await ambulance.save()

  const payload = {
    id: String(ambulance._id),
    coordinates: [longitude, latitude],
    status: ambulance.status,
    updatedAt: ambulance.updatedAt
  }

  try {
    const { getIO } = require('../config/socket')
    getIO().emit('ambulance_location', payload)
  } catch (error) {
    // Location is saved even if socket broadcasting is unavailable.
  }

  res.json(new ApiResponse(200, ambulance, 'Location updated successfully'))
})

// GET /api/ambulance/available
const getAvailable = asyncHandler(async (req, res) => {
  const ambulances = await Ambulance.find({
    status: 'available',
    currentEmergency: null
  })
    .populate('driver', 'name phone email')
    .sort({ createdAt: -1 })

  res.json(new ApiResponse(200, ambulances))
})

// GET /api/ambulance/drivers
const getDrivers = asyncHandler(async (req, res) => {
  const User = require('../models/User')

  const drivers = await User.find({ role: 'driver', isActive: true })
    .select('name email phone')
    .sort({ name: 1 })
    .lean()

  const assigned = await Ambulance.find({ driver: { $in: drivers.map(d => d._id) } })
    .select('driver vehicleNumber')
    .lean()

  const assignedMap = new Map(
    assigned.map(a => [String(a.driver), { id: String(a._id), vehicleNumber: a.vehicleNumber }])
  )

  res.json(new ApiResponse(
    200,
    drivers.map(d => ({ ...d, ambulance: assignedMap.get(String(d._id)) || null }))
  ))
})

module.exports = {
  getAmbulances,
  getDrivers,
  createAmbulance,
  updateAmbulance,
  updateLocation,
  getAvailable
}

