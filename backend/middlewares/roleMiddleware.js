const ApiError = require('../utils/ApiError')
const { isConfiguredAdminEmail } = require('../utils/adminAccess')

const authorize = (...roles) => (req, res, next) => {
  const isAdmin =
    req.user.role === 'admin' && isConfiguredAdminEmail(req.user.email)

  if (!isAdmin && !roles.includes(req.user.role)) {
    throw new ApiError(403, `Role '${req.user.role}' is not authorized`)
  }
  next()
}

module.exports = { authorize }
