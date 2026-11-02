const ApiError = require('../utils/ApiError')
const { isConfiguredAdminEmail } = require('../utils/adminAccess')

const requireAdmin = (req, res, next) => {
  if (
    req.user?.role !== 'admin' ||
    !isConfiguredAdminEmail(req.user.email)
  ) {
    throw new ApiError(403, 'Admin access only')
  }

  next()
}

const requireAdminOrDevice = (req, res, next) => {
  if (req.isDevice) return next()
  return requireAdmin(req, res, next)
}

module.exports = { requireAdmin, requireAdminOrDevice }