const express = require('express')

const {
  deviceOrUser,
  createHelmetEvent,
  listHelmetEvents,
  getHelmetStats,
  updateHelmetEventStatus
} = require('../controllers/helmetController')

const { protect } = require('../middlewares/authMiddleware')
const { authorize } = require('../middlewares/roleMiddleware')

const router = express.Router()

router.post('/events', deviceOrUser, createHelmetEvent)

router.get('/events', protect, listHelmetEvents)
router.get('/stats', protect, getHelmetStats)

router.patch(
  '/events/:id/status',
  protect,
  authorize('dispatcher', 'admin'),
  updateHelmetEventStatus
)

module.exports = router