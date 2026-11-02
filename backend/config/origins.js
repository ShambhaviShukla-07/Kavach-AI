// CLIENT_URL may hold several comma-separated origins; empty means same-origin only.
const allowedOrigins = (process.env.CLIENT_URL || '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean)

module.exports = { corsOrigin: allowedOrigins.length ? allowedOrigins : false }
