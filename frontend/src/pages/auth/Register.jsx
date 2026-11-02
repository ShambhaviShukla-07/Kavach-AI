import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { ROLE_DASHBOARDS } from '../../utils/constants'
import Button from '../../components/ui/Button'
import PhoneInput from '../../components/ui/PhoneInput'
import { getPhoneError } from '../../utils/phone'
import toast from 'react-hot-toast'
import { FiUser, FiMail, FiLock, FiUsers } from 'react-icons/fi'

const REGISTER_ROLES = [
  { value: 'citizen', label: 'Citizen' },
  { value: 'dispatcher', label: 'Dispatcher' },
  { value: 'driver', label: 'Ambulance Driver' },
  { value: 'hospital_admin', label: 'Hospital Admin' }
]

export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', role: 'citizen' })
  const [loading, setLoading] = useState(false)
  const { register } = useAuth()
  const navigate = useNavigate()

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.password.length < 6) { toast.error('Password must be at least 6 characters'); return }
    const phoneError = getPhoneError(form.phone)
    if (phoneError) { toast.error(phoneError); return }
    setLoading(true)
    try {
      const user = await register(form)
      navigate(ROLE_DASHBOARDS[user.role] || '/', { replace: true })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = 'w-full glass-light rounded-xl pl-10 pr-4 py-3 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-cyan-400/50 transition-all'

  return (
    <>
      <h2 className="text-2xl font-black text-white mb-1">Create account</h2>
      <p className="text-slate-400 text-sm mb-6">Join KavachAI emergency network</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <FiUser className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input type="text" required placeholder="Full Name" value={form.name} onChange={e => set('name', e.target.value)} className={inputCls} />
        </div>
        <div className="relative">
          <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input type="email" required placeholder="Email address" value={form.email} onChange={e => set('email', e.target.value)} className={inputCls} />
        </div>
        <div className="relative">
          <PhoneInput required value={form.phone} onChange={v => set('phone', v)} />
        </div>
        <div className="relative">
          <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input type="password" required placeholder="Password (min 6 chars)" value={form.password} onChange={e => set('password', e.target.value)} className={inputCls} />
        </div>
        <div className="relative">
          <FiUsers className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <select value={form.role} onChange={e => set('role', e.target.value)} className={inputCls}>
            {REGISTER_ROLES.map(r => (
              <option key={r.value} value={r.value} className="bg-slate-900">{r.label}</option>
            ))}
          </select>
        </div>
        <Button type="submit" loading={loading} className="w-full" size="lg">Create Account</Button>
      </form>

      <p className="text-center text-slate-500 text-sm mt-6">
        Already have an account?{' '}
        <Link to="/login" className="text-cyan-400 hover:text-cyan-300 font-semibold">Sign in</Link>
      </p>
    </>
  )
}
