const mongoose = require('mongoose')

const helmetDeviceSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    location: {
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
      speedKmh: { type: Number, default: null },
      recordedAt: { type: Date, default: null }
    },
    gpsPointCount: { type: Number, default: 0 },
    locationHistory: {
      type: [new mongoose.Schema({
        latitude: Number,
        longitude: Number,
        speedKmh: { type: Number, default: null },
        recordedAt: Date
      }, { _id: false })],
      default: []
    },
    buzzerActive: { type: Boolean, default: false },
    smsResults: [{
      eventId: { type: String, required: true },
      contactIndex: { type: Number, required: true },
      contactNumber: { type: String, default: '' },
      status: { type: String, enum: ['SENT', 'FAILED'], required: true },
      modemResponse: { type: String, default: '' },
      receivedAt: { type: Date, default: Date.now }
    }]
  },
  { timestamps: true }
)

module.exports = mongoose.model('HelmetDevice', helmetDeviceSchema)