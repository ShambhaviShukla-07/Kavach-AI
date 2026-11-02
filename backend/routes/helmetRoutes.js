const express = require('express')

const {
  deviceOrUser,
  createHelmetEvent,
  listHelmetEvents,
  getHelmetStats,
  updateHelmetEventStatus,
  getHelmetDeviceStatus
} = require('../controllers/helmetController')

const { protect } = require('../middlewares/authMiddleware')
const {
  requireAdmin,
  requireAdminOrDevice
} = require('../middlewares/adminMiddleware')

const router = express.Router()

router.post('/events', deviceOrUser, requireAdminOrDevice, createHelmetEvent)

router.get('/events', protect, requireAdmin, listHelmetEvents)
router.get('/stats', protect, requireAdmin, getHelmetStats)
router.get('/device', protect, requireAdmin, getHelmetDeviceStatus)

router.patch(
  '/events/:id/status',
  protect,
  requireAdmin,
  updateHelmetEventStatus
)

module.exports = router