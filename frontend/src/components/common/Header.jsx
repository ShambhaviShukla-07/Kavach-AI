import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FiBell,
  FiMenu,
  FiSearch,
  FiCheck,
} from 'react-icons/fi'
import { useAuth } from '../../context/AuthContext'
import { io } from 'socket.io-client'
import api from '../../services/api'
import toast from 'react-hot-toast'

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  (import.meta.env.DEV ? 'http://localhost:5000' : window.location.origin)

const roleBadge = {
  citizen: {
    label: 'Citizen',
    color: 'bg-cyan-400/20 text-cyan-400',
  },
  dispatcher: {
    label: 'Dispatcher',
    color: 'bg-violet-400/20 text-violet-400',
  },
  driver: {
    label: 'Driver',
    color: 'bg-green-400/20 text-green-400',
  },
  hospital_admin: {
    label: 'Hospital Admin',
    color: 'bg-pink-400/20 text-pink-400',
  },
}

export default function Header({ onMenuClick }) {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [notifications, setNotifications] = useState([])
  const [showNotifications, setShowNotifications] = useState(false)
  const [notificationsLoading, setNotificationsLoading] = useState(false)

  const unreadCount = notifications.filter(
    notification => !notification.read
  ).length

  const rb = roleBadge[user?.role] || {
    label: user?.role || 'User',
    color: 'bg-slate-400/20 text-slate-400',
  }

  // Load notifications and listen for real-time updates
  useEffect(() => {
    if (!user?._id) return

    let active = true

    const loadNotifications = async () => {
      setNotificationsLoading(true)

      try {
        const response = await api.get('/notifications')

        if (active) {
          setNotifications(response.data.data || [])
        }
      } catch (error) {
        if (active) {
          console.error(
            'Notification loading error:',
            error.response?.data || error.message
          )
        }
      } finally {
        if (active) {
          setNotificationsLoading(false)
        }
      }
    }

    loadNotifications()

    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
    })

    socket.on('connect', () => {
      socket.emit('join_user_room', String(user._id))
    })

    socket.on('new_notification', notification => {
      if (!active || !notification) return

      setNotifications(previous => {
        if (
          previous.some(
            item => item._id === notification._id
          )
        ) {
          return previous
        }

        return [notification, ...previous].slice(0, 20)
      })

      toast.success(notification.title || 'New notification')
    })

    return () => {
      active = false
      socket.disconnect()
    }
  }, [user?._id])

  // Mark all notifications as read
  const markNotificationsRead = async () => {
    try {
      await api.put('/notifications/read')

      setNotifications(previous =>
        previous.map(notification => ({
          ...notification,
          read: true,
        }))
      )

      toast.success('All notifications marked as read')
    } catch (error) {
      console.error(
        'Mark notifications read error:',
        error.response?.data || error.message
      )

      toast.error('Could not mark notifications as read')
    }
  }

  return (
    <header
      className="h-16 flex items-center justify-between px-4 sm:px-6 flex-shrink-0"
      style={{
        background: 'rgba(3,7,18,0.9)',
        borderBottom: '1px solid rgba(34,211,238,0.08)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Left Section */}
      <div className="flex items-center gap-3">

        {/* Mobile Menu */}
        <button
          type="button"
          onClick={onMenuClick}
          className="lg:hidden w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-cyan-400 transition-colors"
          style={{
            background: 'rgba(34,211,238,0.05)',
            border: '1px solid rgba(34,211,238,0.1)',
          }}
        >
          <FiMenu />
        </button>

        {/* Search */}
        <div
          className="hidden sm:flex items-center gap-2 rounded-xl px-3 py-2 w-56"
          style={{
            background: 'rgba(30,41,59,0.5)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <FiSearch className="text-slate-500 text-sm flex-shrink-0" />

          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="bg-transparent text-sm text-slate-300 placeholder-slate-500 outline-none w-full"
          />
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-3">

        {/* Role Badge */}
        <span
          className={`hidden sm:inline-flex text-xs font-semibold px-3 py-1 rounded-full ${rb.color}`}
        >
          {rb.label}
        </span>

        {/* Notification Bell */}
        <div className="relative">

          <button
            type="button"
            onClick={() =>
              setShowNotifications(previous => !previous)
            }
            className="relative w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-cyan-400 transition-colors"
            style={{
              background: 'rgba(30,41,59,0.5)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
            aria-label={`Notifications, ${unreadCount} unread`}
            aria-expanded={showNotifications}
          >
            <FiBell className="text-base" />

            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 bg-red-500 rounded-full text-white text-[10px] flex items-center justify-center">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {/* Notification Dropdown */}
          {showNotifications && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowNotifications(false)}
              />

              <div className="absolute right-0 top-12 z-50 w-80 max-w-[90vw] glass rounded-2xl border border-slate-700 shadow-xl overflow-hidden">

                {/* Dropdown Header */}
                <div className="px-4 py-3 border-b border-slate-700/60 flex items-center justify-between">
                  <h3 className="text-white font-bold">
                    Notifications
                  </h3>

                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={markNotificationsRead}
                      className="text-cyan-400 text-xs hover:text-cyan-300"
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                {/* Notification List */}
                <div className="max-h-80 overflow-y-auto">

                  {notificationsLoading ? (
                    <div className="p-5 text-center text-slate-400 text-sm">
                      Loading notifications...
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="p-5 text-center text-slate-400 text-sm">
                      No notifications yet.
                    </div>
                  ) : (
                    notifications.map(notification => (
                      <div
                        key={notification._id}
                        className={`px-4 py-3 border-b border-slate-700/40 ${
                          notification.read
                            ? ''
                            : 'bg-cyan-500/5'
                        }`}
                      >
                        <div className="flex items-start gap-3">

                          <FiBell className="text-cyan-400 mt-1 shrink-0" />

                          <div className="min-w-0 flex-1">

                            <p className="text-white text-sm font-semibold">
                              {notification.title}
                            </p>

                            <p className="text-slate-400 text-xs mt-1 break-words">
                              {notification.message}
                            </p>

                            <p className="text-slate-500 text-xs mt-2">
                              {notification.createdAt
                                ? new Date(
                                    notification.createdAt
                                  ).toLocaleString()
                                : ''}
                            </p>

                            {notification.link && (
                              <button
                                type="button"
                                onClick={() => {
                                  setShowNotifications(false)
                                  navigate(notification.link)
                                }}
                                className="text-cyan-400 text-xs mt-2 hover:text-cyan-300"
                              >
                                View details
                              </button>
                            )}
                          </div>

                          {!notification.read && (
                            <FiCheck className="text-cyan-400 shrink-0" />
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Profile */}
        <button
          type="button"
          onClick={() => navigate('/profile')}
          className="flex items-center gap-2 rounded-xl p-1 text-left hover:bg-white/5 transition-colors"
          title="Open Profile"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-indigo-500 flex items-center justify-center text-xs font-black text-white glow-cyan-sm">
            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </div>

          <div className="hidden md:block">
            <div className="text-white text-sm font-semibold leading-none">
              {user?.name || 'User'}
            </div>

            <div className="text-slate-500 text-xs mt-0.5">
              {user?.email || ''}
            </div>
          </div>
        </button>
      </div>
    </header>
  )
}