import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
} from 'libphonenumber-js/max'
import { Metadata } from 'libphonenumber-js/core'
import metadata from 'libphonenumber-js/metadata.max.json'

export const DEFAULT_COUNTRY = 'IN'

const MOBILE_TYPES = ['MOBILE', 'FIXED_LINE_OR_MOBILE']

// Mobile number length rules for a country, e.g. India -> { min: 10, max: 10 }.
export function getLengthRules(country) {
  try {
    const meta = new Metadata(metadata)
    meta.country(country)

    let lengths = meta.type('MOBILE')?.possibleLengths?.() || []
    if (!lengths.length) lengths = meta.possibleLengths?.() || []
    lengths = lengths.filter((length) => length > 0)

    if (lengths.length) {
      return { min: Math.min(...lengths), max: Math.max(...lengths) }
    }
  } catch {
    // Fall through to the generic international limit.
  }

  return { min: 4, max: 15 }
}

export function describeLength(country) {
  const { min, max } = getLengthRules(country)
  return min === max ? `${max} digits` : `${min}-${max} digits`
}

const regionNames =
  typeof Intl !== 'undefined' && Intl.DisplayNames
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null

export const COUNTRY_OPTIONS = getCountries()
  .map((code) => ({
    code,
    name: regionNames?.of(code) || code,
    dialCode: getCountryCallingCode(code),
  }))
  .sort((a, b) => a.name.localeCompare(b.name))

// Only digits are ever allowed in the number box, limited to the country's length.
// A leading 0 (national trunk prefix) is dropped when it would exceed the limit.
export const digitsOnly = (value) => String(value || '').replace(/\D/g, '')

export function limitNational(value, country) {
  const { max } = getLengthRules(country)
  let digits = digitsOnly(value)

  if (digits.length > max && digits.startsWith('0')) {
    digits = digits.replace(/^0+/, '')
  }

  return digits.slice(0, max)
}

// Builds the stored value (E.164) from a country and the typed national number.
export function buildPhone(country, national) {
  const digits = digitsOnly(national)
  if (!digits) return ''

  const parsed = parsePhoneNumberFromString(digits, country)
  if (parsed?.isValid()) return parsed.number

  return `+${getCountryCallingCode(country)}${digits}`
}

// Splits a stored value into country and national digits. Older numbers
// without a country code are read as numbers of the default country.
export function splitPhone(value, fallbackCountry = DEFAULT_COUNTRY) {
  const text = String(value || '').trim()
  if (!text) return { country: fallbackCountry, national: '' }

  const parsed = parsePhoneNumberFromString(text, fallbackCountry)

  if (parsed?.country) {
    return { country: parsed.country, national: String(parsed.nationalNumber) }
  }

  return { country: fallbackCountry, national: digitsOnly(text) }
}

// Returns an error message, or '' when the number is valid.
export function getPhoneError(value) {
  const text = String(value || '').trim()

  if (!text) return 'Phone number is required'
  if (/[^\d+\s().-]/.test(text)) return 'Phone number can contain digits only'

  const parsed = parsePhoneNumberFromString(text)

  if (!parsed || !parsed.isValid()) {
    const { country } = splitPhone(text)
    return `Enter a valid mobile number (${describeLength(country)}) for the selected country`
  }

  const type = parsed.getType()
  if (type && !MOBILE_TYPES.includes(type)) {
    return 'Enter a mobile number, landline numbers are not accepted'
  }

  return ''
}

// Converts any stored number (including older ones) to E.164 when possible.
export function normalizeStoredPhone(value) {
  const { country, national } = splitPhone(value)
  return buildPhone(country, national)
}

export const isPhoneValid = (value) => !getPhoneError(value)
