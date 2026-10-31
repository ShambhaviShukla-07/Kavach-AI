import { useCallback, useEffect, useRef, useState } from 'react'

const getRecognition = () => {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

export const useVoiceAssistant = () => {
  const [supported, setSupported] = useState(() => {
    if (typeof window === 'undefined') return false
    return Boolean(getRecognition() && window.speechSynthesis)
  })
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [error, setError] = useState('')
  const recognitionRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => {
    const Recognition = getRecognition()
    setSupported(Boolean(Recognition && window.speechSynthesis))

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (recognitionRef.current) recognitionRef.current.abort()
      if (window.speechSynthesis) window.speechSynthesis.cancel()
    }
  }, [])

  const speak = useCallback((text, options = {}) => {
    if (!text || !window.speechSynthesis) return false

    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = options.lang || 'en-IN'
    utterance.rate = options.rate ?? 0.95
    utterance.pitch = options.pitch ?? 1
    utterance.volume = options.volume ?? 1
    utterance.onstart = () => setSpeaking(true)
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)
    window.speechSynthesis.speak(utterance)
    return true
  }, [])

  const stopSpeaking = useCallback(() => {
    if (window.speechSynthesis) window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [])

  const listen = useCallback(({ timeoutMs = 7000 } = {}) => {
    return new Promise((resolve, reject) => {
      const Recognition = getRecognition()
      if (!Recognition) {
        reject(new Error('Speech recognition is not supported in this browser.'))
        return
      }

      if (recognitionRef.current) recognitionRef.current.abort()

      const recognition = new Recognition()
      recognitionRef.current = recognition
      recognition.lang = 'en-IN'
      recognition.continuous = false
      recognition.interimResults = false
      recognition.maxAlternatives = 1

      let settled = false

      const finish = (callback, value) => {
        if (settled) return
        settled = true
        if (timerRef.current) clearTimeout(timerRef.current)
        setListening(false)
        callback(value)
      }

      recognition.onstart = () => {
        setError('')
        setListening(true)
      }

      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim() || ''
        finish(resolve, transcript)
      }

      recognition.onerror = (event) => {
        if (event.error === 'aborted') {
          finish(reject, new Error('Voice command was cancelled.'))
          return
        }

        const message =
          event.error === 'not-allowed'
            ? 'Microphone permission was denied.'
            : event.error === 'no-speech'
              ? 'No speech was detected.'
              : `Speech recognition failed: ${event.error}`

        setError(message)
        finish(reject, new Error(message))
      }

      recognition.onend = () => {
        setListening(false)
        if (!settled) {
          finish(reject, new Error('No speech was detected.'))
        }
      }

      timerRef.current = setTimeout(() => {
        recognition.stop()
        finish(reject, new Error('Voice command timed out.'))
      }, timeoutMs)

      try {
        recognition.start()
      } catch (startError) {
        finish(reject, startError)
      }
    })
  }, [])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) recognitionRef.current.stop()
    setListening(false)
  }, [])

  return {
    supported,
    listening,
    speaking,
    error,
    speak,
    stopSpeaking,
    listen,
    stopListening
  }
}