
const mongoose = require('mongoose')

const emergencyStatusHistorySchema = new mongoose.Schema({
  status: {
    type: String,
    enum: [
      'pending',
      'acknowledged',
      'dispatched',
      'en_route',
      'arrived',
      'resolved',
      'cancelled'
    ],
    required: true
  },
  changedAt: { type: Date, default: Date.now, required: true },
  changedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  source: {
    type: String,
    enum: ['citizen', 'helmet', 'admin', 'dispatcher', 'driver', 'system'],
    default: 'system'
  }
}, { _id: false })

const emergencySchema = new mongoose.Schema({
  citizen: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function () {
      return !this.deviceId
    },
    index: true
  },

  type: {
    type: String,
    enum: ['medical', 'accident', 'fire', 'women_sos', 'other'],
    required: true
  },

  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'high'
  },

  description: {
    type: String,
    default: ''
  },

  deviceId: {
    type: String,
    default: null,
    index: true
  },

  deviceEventId: {
    type: String,
    default: null
  },

  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },

    // GeoJSON coordinates: [longitude, latitude]
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: function (coordinates) {
          return (
            Array.isArray(coordinates) &&
            coordinates.length === 2 &&
            coordinates.every(Number.isFinite) &&
            coordinates[0] >= -180 &&
            coordinates[0] <= 180 &&
            coordinates[1] >= -90 &&
            coordinates[1] <= 90
          )
        },
        message: 'Coordinates must be [longitude, latitude]'
      }
    },

    address: {
      type: String,
      default: ''
    },

    mapsUrl: {
      type: String,
      default: ''
    },

    accuracy: {
      type: Number,
      default: null
    },

    locationTimestamp: {
      type: Date,
      default: null
    }
  },

  status: {
    type: String,
    enum: [
      'pending',
      'acknowledged',
      'dispatched',
      'en_route',
      'arrived',
      'resolved',
      'cancelled'
    ],
    default: 'pending'
  },

  statusHistory: {
    type: [emergencyStatusHistorySchema],
    default: []
  },

  assignedAmbulance: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ambulance',
    default: null
  },

  assignedDriver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  assignedHospital: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    default: null
  },

  dispatcher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  eta: {
    type: Number,
    default: null
  },

  resolvedAt: {
    type: Date,
    default: null
  },

  notes: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
})

// Geospatial index for location-based emergency searches
emergencySchema.index({ location: '2dsphere' })
emergencySchema.index(
  { deviceId: 1, deviceEventId: 1 },
  { unique: true, partialFilterExpression: { deviceEventId: { $type: 'string' } } }
)

module.exports = mongoose.model('Emergency', emergencySchema)

