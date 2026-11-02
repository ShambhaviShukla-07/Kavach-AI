const express = require('express')
const {
  authenticateDevice,
  updateLocation,
  getLatestLocation,
  updateBuzzerStatus,
  createDeviceIncident,
  recordSmsStatus
} = require('../controllers/deviceController')

const router = express.Router()

router.use(authenticateDevice)
router.post('/:deviceId/location', updateLocation)
router.get('/:deviceId/location/latest-for-device', getLatestLocation)
router.post('/:deviceId/buzzer-status', updateBuzzerStatus)
router.post('/:deviceId/incidents', createDeviceIncident)
router.post('/:deviceId/sms-status', recordSmsStatus)

module.exports = router