const { parsePhoneNumberFromString } = require('libphonenumber-js/max')
const ApiError = require('./ApiError')

// Digits plus the usual separators; anything else (letters, symbols) is rejected.
const ALLOWED_CHARACTERS = /^\+[\d\s().-]+$/

const MOBILE_TYPES = ['MOBILE', 'FIXED_LINE_OR_MOBILE']

// Returns the number in E.164 format (e.g. +919876543210) or null when invalid.
// With mobileOnly, landline, toll-free, premium and VoIP numbers are rejected.
const toE164 = (value, defaultCountry, { mobileOnly = false } = {}) => {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()

  if (defaultCountry) {
    if (!/^\+?[\d\s().-]+$/.test(trimmed)) return null
  } else if (!ALLOWED_CHARACTERS.test(trimmed)) {
    return null
  }

  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry)

  if (!parsed || !parsed.isValid()) return null

  if (mobileOnly) {
    const type = parsed.getType()
    if (type && !MOBILE_TYPES.includes(type)) return null
  }

  return parsed.number
}

// Strict validation for user input: an international mobile number with +country code is required.
const normalizePhone = (value, label = 'Phone number') => {
  const number = toE164(value, undefined, { mobileOnly: true })

  if (!number) {
    throw new ApiError(
      400,
      `${label} is invalid. Use a valid mobile number with country code, digits only (e.g. +919876543210 for India)`
    )
  }

  return number
}

const isValidPhone = (value) =>
  Boolean(toE164(value, undefined, { mobileOnly: true }))

module.exports = { toE164, normalizePhone, isValidPhone }
