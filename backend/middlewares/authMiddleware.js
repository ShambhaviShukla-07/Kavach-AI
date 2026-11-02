const jwt = require('jsonwebtoken')
const User = require('../models/User')
const ApiError = require('../utils/ApiError')
const asyncHandler = require('../utils/asyncHandler')
const { isConfiguredAdminEmail } = require('../utils/adminAccess')

const protect = asyncHandler(async (req, res, next) => {
  let token
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1]
  }
  if (!token) throw new ApiError(401, 'Not authorized, no token')

  const decoded = jwt.verify(token, process.env.JWT_SECRET)
  req.user = await User.findById(decoded.id).select('-password')
  if (!req.user) throw new ApiError(401, 'User not found')
  if (
    req.user.role === 'admin' &&
    !isConfiguredAdminEmail(req.user.email)
  ) {
    throw new ApiError(401, 'Admin account is not configured')
  }
  next()
})

module.exports = { protect }
