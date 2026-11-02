import { useEffect, useRef, useState } from 'react'
import {
  COUNTRY_OPTIONS,
  buildPhone,
  describeLength,
  getPhoneError,
  limitNational,
  splitPhone,
} from '../../utils/phone'

const baseCls =
  'glass-light w-full rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-cyan-400/50 transition-all'

// Controlled phone field: value is an E.164 string such as +919876543210.
export default function PhoneInput({
  value,
  onChange,
  placeholder = '',
  required = false,
  disabled = false,
  className = '',
  fieldClass = baseCls,
}) {
  const initial = splitPhone(value)
  const [country, setCountry] = useState(initial.country)
  const [national, setNational] = useState(initial.national)
  const [touched, setTouched] = useState(false)
  const lastEmitted = useRef(value || '')

  // Re-sync when the parent loads or replaces the value (e.g. saved contacts).
  useEffect(() => {
    if ((value || '') !== lastEmitted.current) {
      const next = splitPhone(value, country)
      setCountry(next.country)
      setNational(next.national)
      lastEmitted.current = value || ''
    }
  }, [value, country])

  const emit = (nextCountry, nextNational) => {
    const phone = buildPhone(nextCountry, nextNational)
    lastEmitted.current = phone
    onChange(phone)
  }

  const handleCountry = (event) => {
    const nextCountry = event.target.value
    const nextNational = limitNational(national, nextCountry)
    setCountry(nextCountry)
    setNational(nextNational)
    emit(nextCountry, nextNational)
  }

  const handleNumber = (event) => {
    const raw = event.target.value

    // A pasted international number (+91...) also selects its country.
    if (raw.trim().startsWith('+')) {
      const pasted = splitPhone(raw, country)
      const digits = limitNational(pasted.national, pasted.country)
      setCountry(pasted.country)
      setNational(digits)
      emit(pasted.country, digits)
      return
    }

    const digits = limitNational(raw, country)
    setNational(digits)
    emit(country, digits)
  }

  const error =
    touched && (national || required) ? getPhoneError(buildPhone(country, national)) : ''
  const lengthHint = describeLength(country)

  return (
    <div className={className}>
      <div className="flex gap-2">
        <select
          value={country}
          onChange={handleCountry}
          disabled={disabled}
          aria-label="Country"
          style={{ width: '7.5rem', flexShrink: 0 }}
          className={`${fieldClass} bg-transparent !px-2`}
        >
          {COUNTRY_OPTIONS.map((option) => (
            <option key={option.code} value={option.code} className="bg-slate-900">
              {option.code} +{option.dialCode} — {option.name}
            </option>
          ))}
        </select>

        <input
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          value={national}
          onChange={handleNumber}
          onBlur={() => setTouched(true)}
          onKeyDown={(event) => {
            if (
              event.key.length === 1 &&
              !/\d/.test(event.key) &&
              !event.ctrlKey &&
              !event.metaKey
            ) {
              event.preventDefault()
            }
          }}
          placeholder={placeholder || lengthHint}
          required={required}
          disabled={disabled}
          className={`${fieldClass} min-w-0 flex-1`}
        />
      </div>

      {error ? (
        <p className="mt-1 text-xs text-red-400">{error}</p>
      ) : (
        <p className="mt-1 text-xs text-slate-500">
          {country} mobile number: {lengthHint}
        </p>
      )}
    </div>
  )
}
