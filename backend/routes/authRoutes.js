const express = require('express')

const router = express.Router()

const {
  register,
  login,
  getMe,
  updateProfile,
  forgotPassword,
  resetPassword
} = require('../controllers/authController')

const { protect } = require('../middlewares/authMiddleware')

// Register
router.post('/register', register)

// Login
router.post('/login', login)

// Forgot Password
router.post('/forgot-password', forgotPassword)

// Reset Password
router.post('/reset-password/:token', resetPassword)

// Get logged-in user
router.get('/me', protect, getMe)

// Update profile
router.put('/update-profile', protect, updateProfile)

module.exports = router