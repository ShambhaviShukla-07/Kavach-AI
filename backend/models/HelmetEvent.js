const mongoose = require('mongoose')

const helmetEventSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
      index: true
    },

    rider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },

    location: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      address: { type: String, default: '' }
    },

    features: {
      type: Object,
      required: true
    },

    prediction: {
      isCrash: { type: Boolean, required: true },
      confidence: { type: Number, required: true },
      severity: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'low'
      },
      modelVersion: { type: String, default: '' },
      reasons: { type: [String], default: [] }
    },

    emergency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Emergency',
      default: null
    },

    source: {
      type: String,
      enum: ['helmet', 'simulation'],
      default: 'helmet'
    },

    status: {
      type: String,
      enum: ['new', 'acknowledged', 'false_alarm', 'dispatched'],
      default: 'new'
    }
  },
  { timestamps: true }
)

helmetEventSchema.index({ createdAt: -1 })

module.exports = mongoose.model('HelmetEvent', helmetEventSchema)