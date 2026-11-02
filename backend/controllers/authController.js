const jwt = require('jsonwebtoken')
const crypto = require('crypto')

const User = require('../models/User')
const ApiError = require('../utils/ApiError')
const ApiResponse = require('../utils/ApiResponse')
const asyncHandler = require('../utils/asyncHandler')
const { isConfiguredAdminEmail } = require('../utils/adminAccess')
const { normalizePhone } = require('../utils/phone')

const SELF_REGISTER_ROLES = ['citizen', 'dispatcher', 'driver', 'hospital_admin']

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE
  })

// POST /api/auth/register
const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone, role } = req.body

  if (!name || !email || !password || !phone) {
    throw new ApiError(400, 'All fields required')
  }

  // Admin accounts can never be self-registered.
  const selectedRole = role || 'citizen'

  if (!SELF_REGISTER_ROLES.includes(selectedRole)) {
    throw new ApiError(400, 'Invalid role selected')
  }

  const normalizedEmail = email.trim().toLowerCase()

  if (isConfiguredAdminEmail(normalizedEmail)) {
    throw new ApiError(403, 'This email is reserved for an administrator account')
  }

  const normalizedPhone = normalizePhone(phone)

  const exists = await User.findOne({ email: normalizedEmail })

  if (exists) {
    throw new ApiError(400, 'Email already registered')
  }

  const user = await User.create({
    name,
    email: normalizedEmail,
    password,
    phone: normalizedPhone,
    role: selectedRole
  })

  const token = generateToken(user._id)

  res.status(201).json(
    new ApiResponse(201, { user, token }, 'Registered successfully')
  )
})

// POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    throw new ApiError(400, 'Email and password required')
  }

  const user = await User.findOne({
    email: email.trim().toLowerCase()
  }).select('+password')

  if (!user || !(await user.matchPassword(password))) {
    throw new ApiError(401, 'Invalid credentials')
  }

  if (user.role === 'admin' && !isConfiguredAdminEmail(user.email)) {
    throw new ApiError(401, 'Invalid credentials')
  }

  const token = generateToken(user._id)

  user.password = undefined

  res.json(
    new ApiResponse(200, { user, token }, 'Login successful')
  )
})

// GET /api/auth/me
const getMe = asyncHandler(async (req, res) => {
  res.json(new ApiResponse(200, req.user))
})

// PUT /api/auth/update-profile
const updateProfile = asyncHandler(async (req, res) => {
  const { name, phone } = req.body
  const updates = {}

  if (name !== undefined) updates.name = name
  if (phone !== undefined) updates.phone = normalizePhone(phone)

  const user = await User.findByIdAndUpdate(
    req.user._id,
    updates,
    { new: true, runValidators: true }
  )

  res.json(
    new ApiResponse(200, user, 'Profile updated')
  )
})

// POST /api/auth/forgot-password
const forgotPassword = asyncHandler(async (req, res) => {
  const email = req.body.email?.trim().toLowerCase()

  if (!email) {
    throw new ApiError(400, 'Email is required')
  }

  const message =
    'If an account exists with this email, a password reset link will be sent.'

  const user = await User.findOne({ email })

  // Do not reveal whether an account exists
  if (!user) {
    return res.json(new ApiResponse(200, {}, message))
  }

  const {
    EMAILJS_SERVICE_ID,
    EMAILJS_RESET_TEMPLATE_ID,
    EMAILJS_PUBLIC_KEY,
    EMAILJS_PRIVATE_KEY,
    FRONTEND_URL
  } = process.env
   
  console.log('EmailJS Config Check:', {
  SERVICE_ID: !!process.env.EMAILJS_SERVICE_ID,
  RESET_TEMPLATE_ID: !!process.env.EMAILJS_RESET_TEMPLATE_ID,
  PUBLIC_KEY: !!process.env.EMAILJS_PUBLIC_KEY,
  FRONTEND_URL: !!process.env.FRONTEND_URL
})

  if (
    !EMAILJS_SERVICE_ID ||
    !EMAILJS_RESET_TEMPLATE_ID ||
    !EMAILJS_PUBLIC_KEY ||
    !FRONTEND_URL
  ) {
    console.error('Password reset EmailJS configuration is missing')
    throw new ApiError(500, 'Password reset email service is not configured')
  }

  // Generate secure random token
  const resetToken = crypto.randomBytes(32).toString('hex')

  // Store only hashed token in MongoDB
  user.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex')

  // Token expires in 15 minutes
  user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000)

  await user.save()

  const resetUrl =
    `${FRONTEND_URL.replace(/\/$/, '')}/reset-password/${resetToken}`

  try {
    const emailResponse = await fetch(
      'https://api.emailjs.com/api/v1.0/email/send',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          service_id: EMAILJS_SERVICE_ID,
          template_id: EMAILJS_RESET_TEMPLATE_ID,
          user_id: EMAILJS_PUBLIC_KEY,

          ...(EMAILJS_PRIVATE_KEY
            ? { accessToken: EMAILJS_PRIVATE_KEY }
            : {}),

          template_params: {
            to_email: user.email,
            to_name: user.name,
            reset_link: resetUrl,
            expiry_time: '15 minutes'
          }
        })
      }
    )

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text()
      throw new Error(errorText || 'EmailJS request failed')
    }

  } catch (error) {
    // Clear token if email sending fails
    user.resetPasswordToken = undefined
    user.resetPasswordExpires = undefined

    await user.save()

    console.error('EmailJS password reset error:', error)

    throw new ApiError(500, 'Unable to send password reset email')
  }

  res.json(new ApiResponse(200, {}, message))
})

// POST /api/auth/reset-password/:token
const resetPassword = asyncHandler(async (req, res) => {
  const { token } = req.params
  const { password, confirmPassword } = req.body

  if (!token) {
    throw new ApiError(400, 'Reset token is required')
  }

  if (!password || password.length < 6) {
    throw new ApiError(400, 'Password must be at least 6 characters')
  }

  if (confirmPassword !== undefined && password !== confirmPassword) {
    throw new ApiError(400, 'Passwords do not match')
  }

  const hashedToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex')

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpires: { $gt: new Date() }
  }).select('+password')

  if (!user) {
    throw new ApiError(400, 'Invalid or expired password reset link')
  }

  // User model's pre-save middleware will hash the new password
  user.password = password

  // Make the token unusable after successful reset
  user.resetPasswordToken = undefined
  user.resetPasswordExpires = undefined

  await user.save()

  res.json(
    new ApiResponse(
      200,
      {},
      'Password reset successful. Please login.'
    )
  )
})

module.exports = {
  register,
  login,
  getMe,
  updateProfile,
  forgotPassword,
  resetPassword
}