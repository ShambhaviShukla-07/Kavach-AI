import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FiMail, FiArrowLeft, FiCheckCircle } from 'react-icons/fi'
import Button from '../../components/ui/Button'
import toast from 'react-hot-toast'
import api from '../../services/api'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()

    const normalizedEmail = email.trim().toLowerCase()

    if (!normalizedEmail) {
      toast.error('Please enter your email address')
      return
    }

    setLoading(true)

    try {
      const response = await api.post('/auth/forgot-password', {
        email: normalizedEmail
      })

      toast.success(
        response.data?.message ||
        'If an account exists with this email, a reset link will be sent.'
      )

      setSubmitted(true)
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
        'Unable to send reset link. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <h2 className="text-2xl font-black text-white mb-1">
        Forgot Password?
      </h2>

      <p className="text-slate-400 text-sm mb-6">
        Enter your registered email to reset your password.
      </p>

      {submitted ? (
        <div className="text-center py-5">
          <FiCheckCircle className="text-4xl text-green-400 mx-auto mb-4" />

          <h3 className="text-white font-bold text-lg mb-2">
            Check Your Email
          </h3>

          <p className="text-slate-400 text-sm mb-5">
            If an account exists with this email, a password reset link
            will be sent. Please check your inbox.
          </p>

          <button
            type="button"
            onClick={() => {
              setSubmitted(false)
              setEmail('')
            }}
            className="text-cyan-400 text-sm font-semibold hover:text-cyan-300"
          >
            Try another email
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-slate-400 mb-1.5 block">
              Email Address
            </label>

            <div className="relative">
              <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />

              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full glass-light rounded-xl pl-10 pr-4 py-3 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-cyan-400/50"
              />
            </div>
          </div>

          <Button
            type="submit"
            loading={loading}
            disabled={loading}
            className="w-full"
            size="lg"
          >
            Send Reset Link
          </Button>
        </form>
      )}

      <p className="text-center mt-6">
        <Link
          to="/login"
          className="text-cyan-400 hover:text-cyan-300 text-sm font-semibold inline-flex items-center gap-2"
        >
          <FiArrowLeft />
          Back to Login
        </Link>
      </p>
    </>
  )
}