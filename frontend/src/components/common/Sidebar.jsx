import { NavLink, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { RiShieldFlashFill } from 'react-icons/ri'
import {
FiHome,
FiAlertCircle,
FiTruck,
FiActivity,
FiMapPin,
FiShield,
FiLogOut,
FiUser,
FiHeart,
} from 'react-icons/fi'
import { useAuth } from '../../context/AuthContext'

const navByRole = {
citizen: [
{ to: '/citizen/dashboard', icon: <FiHome />, label: 'Dashboard' },
{ to: '/citizen/ambulancedashboard', icon: <FiTruck />, label: 'Ambulance Module' },
{ to: '/citizen/history', icon: <FiActivity />, label: 'My History' },
{ to: '/citizen/women-safety', icon: <FiShield />, label: 'Women Safety' }
],

dispatcher: [
{ to: '/dispatcher/dashboard', icon: <FiHome />, label: 'Dashboard' },
{ to: '/dispatcher/emergencies', icon: <FiAlertCircle />, label: 'Emergency Requests' },
{ to: '/dispatcher/ambulances', icon: <FiTruck />, label: 'Ambulance Management' },
{ to: '/dispatcher/tracking', icon: <FiMapPin />, label: 'Live Tracking' },
],

admin: [
{ to: '/admin/helmet', icon: <FiShield />, label: 'Helmet Monitor' },
{ to: '/dispatcher/dashboard', icon: <FiHome />, label: 'Operations Dashboard' },
{ to: '/dispatcher/emergencies', icon: <FiAlertCircle />, label: 'Emergency Requests' },
{ to: '/dispatcher/ambulances', icon: <FiTruck />, label: 'Ambulance Management' },
{ to: '/dispatcher/tracking', icon: <FiMapPin />, label: 'Live Tracking' },
{ to: '/hospital/dashboard', icon: <FiHome />, label: 'Hospital Dashboard' },
{ to: '/hospital/admissions', icon: <FiHeart />, label: 'Admissions' },
{ to: '/driver/active', icon: <FiTruck />, label: 'Driver Missions' },
{ to: '/driver/history', icon: <FiActivity />, label: 'Driver History' },
{ to: '/citizen/dashboard', icon: <FiHome />, label: 'Citizen Dashboard' },
{ to: '/citizen/request', icon: <FiAlertCircle />, label: 'Request Ambulance' },
{ to: '/citizen/ambulancedashboard', icon: <FiTruck />, label: 'Ambulance Module' },
{ to: '/citizen/history', icon: <FiActivity />, label: 'Emergency History' },
{ to: '/citizen/women-safety', icon: <FiHeart />, label: 'Women Safety' }
],

driver: [
{ to: '/driver/dashboard', icon: <FiHome />, label: 'Dashboard' },
{ to: '/driver/active', icon: <FiTruck />, label: 'Active Mission' },
{ to: '/driver/history', icon: <FiActivity />, label: 'Trip History' }
],

hospital_admin: [
{ to: '/hospital/dashboard', icon: <FiHome />, label: 'Dashboard' },
{ to: '/hospital/admissions', icon: <FiHeart />, label: 'Admissions' }
]
}

const roleColors = {
citizen: 'from-cyan-400 to-blue-500',
dispatcher: 'from-violet-400 to-indigo-500',
driver: 'from-green-400 to-teal-500',
  hospital_admin: 'from-pink-400 to-rose-500',
  admin: 'from-cyan-400 to-teal-500'
}

export default function Sidebar({ onClose }) {
const { user, logout } = useAuth()
const navigate = useNavigate()
const links = navByRole[user?.role] || []

const handleLogout = () => {
logout()
navigate('/')
}

return (
<motion.aside
initial={{ x: -280 }}
animate={{ x: 0 }}
transition={{ duration: 0.3, ease: 'easeOut' }}
className="w-64 h-full flex flex-col"
style={{
background: 'rgba(3,7,18,0.95)',
borderRight: '1px solid rgba(34,211,238,0.1)'
}}
>
<div
className="flex items-center gap-2.5 px-5 py-5"
style={{ borderBottom: '1px solid rgba(34,211,238,0.08)' }}
> <div className="w-8 h-8 rounded-lg bg-cyan-400/20 flex items-center justify-center glow-cyan-sm"> <RiShieldFlashFill className="text-cyan-400 text-lg" /> </div>


    <div>
      <span className="text-lg font-black text-cyan-400 tracking-tight">
        KavachAI
      </span>
      <div className="text-xs text-slate-600 -mt-0.5">
        Emergency Platform
      </div>
    </div>
  </div>

  <div
    className="px-4 py-3"
    style={{ borderBottom: '1px solid rgba(34,211,238,0.08)' }}
  >
    <div
      className="flex items-center gap-3 rounded-xl p-3"
      style={{
        background: 'rgba(34,211,238,0.05)',
        border: '1px solid rgba(34,211,238,0.1)'
      }}
    >
      <div
        className={`w-9 h-9 rounded-xl bg-gradient-to-br ${
          roleColors[user?.role] || 'from-cyan-400 to-blue-500'
        } flex items-center justify-center text-xs font-black text-white flex-shrink-0`}
      >
        {user?.name?.charAt(0).toUpperCase()}
      </div>

      <div className="min-w-0">
        <div className="text-white font-semibold text-sm truncate">
          {user?.name}
        </div>
        <div className="text-slate-500 text-xs capitalize">
          {user?.role?.replace('_', ' ')}
        </div>
      </div>

      <div className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0 animate-pulse" />
    </div>
  </div>

  <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
    <p className="text-xs text-slate-600 font-semibold uppercase tracking-widest px-3 mb-2">
      Navigation
    </p>

    {links.map((link) => (
      <NavLink
        key={link.to}
        to={link.to}
        onClick={onClose}
        className={({ isActive }) =>
          `sidebar-link ${isActive ? 'active' : ''}`
        }
      >
        <span className="text-base flex-shrink-0">{link.icon}</span>
        {link.label}
      </NavLink>
    ))}
  </nav>

  <div
    className="px-3 py-4 space-y-0.5"
    style={{ borderTop: '1px solid rgba(34,211,238,0.08)' }}
  >
    <NavLink
      to="/profile"
      onClick={onClose}
      className={({ isActive }) =>
        `sidebar-link ${isActive ? 'active' : ''}`
      }
    >
      <FiUser className="text-base" /> Profile
    </NavLink>

    <button
      onClick={handleLogout}
      className="sidebar-link w-full text-left hover:!text-red-400 hover:!bg-red-400/5"
    >
      <FiLogOut className="text-base" /> Logout
    </button>
  </div>
</motion.aside>


)
}
