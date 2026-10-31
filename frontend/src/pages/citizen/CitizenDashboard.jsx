import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'

import {
  FiAlertCircle,
  FiClock,
  FiCheckCircle,
  FiShield,
} from 'react-icons/fi'

import { io } from 'socket.io-client'

import { emergencyService } from '../../services/emergencyService'

import StatCard from '../../components/ui/StatCard'
import {
  StatusBadge,
  SeverityBadge,
} from '../../components/ui/SeverityBadge'

import Loader from '../../components/common/Loader'
import { useAuth } from '../../context/AuthContext'
import Button from '../../components/ui/Button'
import toast from 'react-hot-toast'

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  (import.meta.env.DEV
    ? 'http://localhost:5000'
    : window.location.origin)

export default function CitizenDashboard() {
  const { user } = useAuth()

  const [emergencies, setEmergencies] = useState([])
  const [loading, setLoading] = useState(true)

  // Load Citizen Emergencies
  useEffect(() => {
    let cancelled = false

    emergencyService
      .getAll()
      .then(response => {
        if (!cancelled) {
          setEmergencies(response.data.data || [])
        }
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('Failed to load emergencies')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  // Socket.IO: Real-time Emergency Updates
  useEffect(() => {
    if (!user?._id) return

    let active = true

    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
    })

    socket.on('connect', () => {
      socket.emit('join_user_room', String(user._id))
    })

    socket.on('emergency_updated', updatedEmergency => {
      if (!active || !updatedEmergency?._id) return

      setEmergencies(previous => {
        const exists = previous.some(
          item => item._id === updatedEmergency._id
        )

        if (!exists) return previous

        return previous.map(item =>
          item._id === updatedEmergency._id
            ? { ...item, ...updatedEmergency }
            : item
        )
      })
    })

    return () => {
      active = false
      socket.disconnect()
    }
  }, [user?._id])

  // Emergency Statistics
  const active = emergencies.filter(
    emergency =>
      !['resolved', 'cancelled'].includes(emergency.status)
  )

  const resolved = emergencies.filter(
    emergency => emergency.status === 'resolved'
  )

  return (
    <div>

      {/* Welcome Section */}
      <div className="mb-6">
        <h1 className="text-2xl font-black text-white">
          Welcome, {user?.name} 👋
        </h1>

        <p className="text-slate-400 text-sm mt-1">
          Your emergency dashboard — stay safe.
        </p>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">

        <StatCard
          title="Total Requests"
          value={emergencies.length}
          icon={<FiAlertCircle />}
          delay={0}
        />

        <StatCard
          title="Active"
          value={active.length}
          icon={<FiClock />}
          color="text-yellow-400"
          delay={0.1}
        />

        <StatCard
          title="Resolved"
          value={resolved.length}
          icon={<FiCheckCircle />}
          color="text-green-400"
          delay={0.2}
        />

        <StatCard
          title="Safety Score"
          value="98%"
          icon={<FiShield />}
          color="text-cyan-400"
          delay={0.3}
        />

      </div>

      {/* Emergency Action Cards */}
      <div className="grid sm:grid-cols-2 gap-4 mb-8">

        {/* Emergency Help */}
        <motion.div
          whileHover={{ y: -2 }}
          className="glass rounded-2xl p-6 border border-red-500/20 hover:border-red-500/40 transition-all"
        >
          <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center mb-4">
            <FiAlertCircle className="text-red-400 text-xl" />
          </div>

          <h3 className="text-white font-bold text-lg mb-1">
            Request Emergency Help
          </h3>

          <p className="text-slate-400 text-sm mb-4">
            Trigger an emergency request and get help dispatched immediately.
          </p>

          <Link to="/citizen/request">
            <Button variant="danger" size="sm">
              Request Now
            </Button>
          </Link>
        </motion.div>

        {/* Women Safety */}
        <motion.div
          whileHover={{ y: -2 }}
          className="glass rounded-2xl p-6 border border-pink-500/20 hover:border-pink-500/40 transition-all"
        >
          <div className="w-12 h-12 rounded-xl bg-pink-500/20 flex items-center justify-center mb-4">
            <FiShield className="text-pink-400 text-xl" />
          </div>

          <h3 className="text-white font-bold text-lg mb-1">
            Women Safety SOS
          </h3>

          <p className="text-slate-400 text-sm mb-4">
            Trigger a silent SOS alert with your live location instantly.
          </p>

          <Link to="/citizen/women-safety">
            <Button
              variant="danger"
              size="sm"
              className="bg-pink-500/20 border-pink-500/40 text-pink-400"
            >
              SOS Alert
            </Button>
          </Link>
        </motion.div>

      </div>

      {/* Recent Emergencies */}
      <div className="glass rounded-2xl overflow-hidden">

        <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between">

          <h3 className="text-white font-bold">
            Recent Emergencies
          </h3>

          <Link
            to="/citizen/history"
            className="text-cyan-400 text-sm hover:text-cyan-300"
          >
            View all
          </Link>

        </div>

        {loading ? (
          <Loader />
        ) : emergencies.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            No emergencies yet. Stay safe!
          </div>
        ) : (
          <div className="divide-y divide-slate-700/30">

            {emergencies.slice(0, 5).map(emergency => (
              <div
                key={emergency._id}
                className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-slate-700/10 transition-colors"
              >
                <div>

                  <div className="text-white font-semibold text-sm capitalize">
                    {emergency.type?.replace('_', ' ')}
                  </div>

                  <div className="text-slate-500 text-xs mt-0.5">
                    {emergency.location?.address || 'Location recorded'}
                    {' · '}
                    {new Date(
                      emergency.createdAt
                    ).toLocaleDateString()}
                  </div>

                </div>

                <div className="flex items-center gap-2">
                  <SeverityBadge severity={emergency.severity} />
                  <StatusBadge status={emergency.status} />
                </div>

              </div>
            ))}

          </div>
        )}

      </div>
    </div>
  )
}