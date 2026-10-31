import { useEffect, useRef, useState } from 'react'
import { FiAlertTriangle, FiMic, FiMicOff, FiX } from 'react-icons/fi'

import { useVoiceAssistant } from '../hooks/useVoiceAssistant'

const SOS_PATTERN = /\b(help|sos|emergency|bachao|madad)\b/i
const COUNTDOWN_SECONDS = 3

/**
 * Push-to-talk voice SOS.
 *
 * This is deliberately not always-on listening. The user starts recognition
 * with a click, says a fixed keyword, and then has a short cancel window
 * before the existing SOS handler is called.
 */
export default function VoiceSosButton({
  onSos,
  disabled = false,
  locationReady = true,
}) {
  const {
    supported,
    listening,
    error,
    speak,
    listen,
    stopListening,
  } = useVoiceAssistant()

  const [phase, setPhase] = useState('idle')
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS)
  const [message, setMessage] = useState('')
  const countdownRef = useRef(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false

      if (countdownRef.current) {
        clearInterval(countdownRef.current)
      }
    }
  }, [])

  const clearCountdown = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
  }

  const cancelCountdown = () => {
    clearCountdown()
    setPhase('idle')
    setCountdown(COUNTDOWN_SECONDS)
    setMessage('SOS cancelled before sending.')
    speak('SOS cancelled.')
  }

  const sendSos = async () => {
    clearCountdown()
    setPhase('sending')
    setMessage('Sending SOS alert...')

    try {
      const result = await onSos?.()

      if (!mountedRef.current) return

      if (result === false) {
        setMessage('SOS could not be sent. Use the SOS button or call 112.')
      } else {
        setMessage('SOS alert sent. Call 112 if you are in immediate danger.')
      }
    } catch {
      if (!mountedRef.current) return

      setMessage('SOS could not be sent. Use the SOS button or call 112.')
      speak('SOS could not be sent. Use the SOS button or call 112.')
    } finally {
      if (mountedRef.current) {
        setPhase('idle')
      }
    }
  }

  const startCountdown = () => {
    setPhase('countdown')
    setCountdown(COUNTDOWN_SECONDS)
    setMessage(
      'SOS will be sent in 3 seconds. Press cancel if this is a mistake.'
    )
    speak(
      'SOS will be sent in three seconds. Press cancel if this is a mistake.'
    )

    let remaining = COUNTDOWN_SECONDS

    countdownRef.current = setInterval(() => {
      remaining -= 1

      if (!mountedRef.current) return

      setCountdown(Math.max(remaining, 0))

      if (remaining <= 0) {
        sendSos()
      }
    }, 1000)
  }

  const handleVoice = async () => {
    if (disabled || phase === 'countdown' || phase === 'sending') return

    if (listening) {
      stopListening()
      setPhase('idle')
      setMessage('Voice listening stopped.')
      return
    }

    setPhase('listening')
    setMessage('Listening... say "help" or "SOS".')

    try {
      const transcript = await listen({ timeoutMs: 7000 })

      if (!mountedRef.current) return

      if (!SOS_PATTERN.test(transcript)) {
        setPhase('idle')
        setMessage(
          transcript
            ? `Heard "${transcript}". No SOS keyword found.`
            : 'No SOS keyword found.'
        )
        speak(
          'I did not hear an SOS command. Try again or press the SOS button.'
        )
        return
      }

      if (!locationReady) {
        setPhase('idle')
        setMessage('Location is not ready. Allow location access first.')
        speak(
          'Location is not ready. Allow location access before using voice SOS.'
        )
        return
      }

      startCountdown()
    } catch (listenError) {
      if (!mountedRef.current) return

      setPhase('idle')
      setMessage(listenError.message || 'Voice command failed.')
    }
  }

  if (!supported) {
    return (
      <p className="mt-4 max-w-sm text-xs leading-5 text-slate-500">
        Voice SOS is not supported in this browser. Use Chrome or Edge on
        localhost or HTTPS.
      </p>
    )
  }

  if (phase === 'countdown') {
    return (
      <div
        className="mt-4 w-full max-w-sm rounded-2xl border border-red-400/30 bg-red-500/10 p-4"
        role="alert"
      >
        <div className="flex items-center gap-2 text-sm font-bold text-red-200">
          <FiAlertTriangle />
          Sending SOS in {countdown}...
        </div>

        <p className="mt-2 text-xs leading-5 text-red-100/80">
          Press cancel if this was triggered by mistake.
        </p>

        <button
          type="button"
          onClick={cancelCountdown}
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
        >
          <FiX />
          Cancel SOS
        </button>
      </div>
    )
  }

  return (
    <div className="mt-4 w-full max-w-sm">
      <button
        type="button"
        onClick={handleVoice}
        disabled={disabled || phase === 'sending'}
        aria-pressed={listening}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {listening ? <FiMicOff /> : <FiMic />}
        {phase === 'sending'
          ? 'Sending SOS...'
          : listening
            ? 'Listening... tap to stop'
            : 'Voice SOS - say "help"'}
      </button>

      <p className="mt-2 text-xs leading-5 text-slate-500">
        Push-to-talk only. The microphone is used only while listening.
      </p>

      {message || error ? (
        <p className="mt-2 text-xs leading-5 text-slate-400" aria-live="polite">
          {message || error}
        </p>
      ) : null}
    </div>
  )
}
