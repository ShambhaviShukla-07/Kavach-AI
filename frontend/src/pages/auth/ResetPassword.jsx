import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  FiArrowLeft,
  FiLock,
  FiEye,
  FiEyeOff,
  FiCheckCircle
} from 'react-icons/fi'
import Button from '../../components/ui/Button'
import toast from 'react-hot-toast'
import api from '../../services/api'

export default function ResetPassword() {
  const { token } = useParams()
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!password || !confirmPassword) {
      toast.error('Please fill both password fields')
      return
    }

    if (password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    setLoading(true)

    try {
      const response = await api.post(
        `/auth/reset-password/${token}`,
        {
          password,
          confirmPassword
        }
      )

      toast.success(
        response.data?.message || 'Password reset successful!'
      )

      setSuccess(true)
      setPassword('')
      setConfirmPassword('')

      setTimeout(() => {
        navigate('/login', { replace: true })
      }, 2000)

    } catch (error) {
      toast.error(
        error.response?.data?.message ||
        'Unable to reset password. Your link may have expired.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <h2 className="text-2xl font-black text-white mb-1">
        Reset Password
      </h2>

      <p className="text-slate-400 text-sm mb-6">
        Set a new password for your KavachAI account.
      </p>

      {success ? (
        <div className="text-center py-6">
          <FiCheckCircle className="text-5xl text-green-400 mx-auto mb-4" />

          <h3 className="text-white font-bold text-lg mb-2">
            Password Updated!
          </h3>

          <p className="text-slate-400 text-sm">
            Your password has been changed successfully.
            Redirecting you to login...
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* New Password */}
          <div>
            <label className="text-sm text-slate-400 mb-1.5 block">
              New Password
            </label>

            <div className="relative">
              <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />

              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter new password"
                minLength={6}
                required
                className="w-full glass-light rounded-xl pl-10 pr-11 py-3 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-cyan-400/50"
              />

              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                aria-label="Toggle password visibility"
              >
                {showPassword ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="text-sm text-slate-400 mb-1.5 block">
              Confirm New Password
            </label>

            <div className="relative">
              <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />

              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                minLength={6}
                required
                className="w-full glass-light rounded-xl pl-10 pr-11 py-3 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-cyan-400/50"
              />

              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                aria-label="Toggle confirm password visibility"
              >
                {showConfirmPassword ? <FiEyeOff /> : <FiEye />}
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Password must contain at least 6 characters.
          </p>

          <Button
            type="submit"
            loading={loading}
            disabled={loading}
            className="w-full"
            size="lg"
          >
            Reset Password
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