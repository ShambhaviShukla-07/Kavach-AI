
import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { ROLE_DASHBOARDS } from '../../utils/constants'
import Button from '../../components/ui/Button'
import toast from 'react-hot-toast'
import { FiMail, FiLock, FiEye, FiEyeOff } from 'react-icons/fi'

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const user = await login(form.email, form.password)
      const dest =
        location.state?.from?.pathname ||
        ROLE_DASHBOARDS[user.role] ||
        '/'

      navigate(dest, { replace: true })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <h2 className="text-2xl font-black text-white mb-1">
        Welcome back
      </h2>

      <p className="text-slate-400 text-sm mb-6">
        Sign in to your KavachAI account
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm text-slate-400 mb-1.5 block">
            Email
          </label>

          <div className="relative">
            <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />

            <input
              type="email"
              required
              value={form.email}
              onChange={(e) =>
                setForm({ ...form, email: e.target.value })
              }
              placeholder="you@example.com"
              className="w-full glass-light rounded-xl pl-10 pr-4 py-3 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-cyan-400/50 transition-all"
            />
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-sm text-slate-400">
              Password
            </label>

            <Link
              to="/forgot-password"
              className="text-xs font-semibold text-cyan-400 transition hover:text-cyan-300"
            >
              Forgot Password?
            </Link>
          </div>

          <div className="relative">
            <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />

            <input
              type={showPass ? 'text' : 'password'}
              required
              value={form.password}
              onChange={(e) =>
                setForm({ ...form, password: e.target.value })
              }
              placeholder="••••••••"
              className="w-full glass-light rounded-xl pl-10 pr-10 py-3 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-cyan-400/50 transition-all"
            />

            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              {showPass ? <FiEyeOff /> : <FiEye />}
            </button>
          </div>
        </div>

        <Button
          type="submit"
          loading={loading}
          className="w-full"
          size="lg"
        >
          Sign In
        </Button>
      </form>

      <p className="text-center text-slate-500 text-sm mt-6">
        Don't have an account?{' '}
        <Link
          to="/register"
          className="text-cyan-400 hover:text-cyan-300 font-semibold"
        >
          Register
        </Link>
      </p>

      {/* Demo credentials */}
      <div className="mt-6 p-4 glass-light rounded-xl">
        <p className="text-xs text-slate-500 font-semibold mb-2 uppercase tracking-wider">
          Demo Accounts
        </p>

        <div className="space-y-1 text-xs text-slate-400">
          <div>Citizen: citizen@demo.com / demo123</div>
          <div>Dispatcher: dispatcher@demo.com / demo123</div>
          <div>Driver: driver@demo.com / demo123</div>
          <div>Hospital: hospital@demo.com / demo123</div>
        </div>
      </div>
    </>
  )
}

