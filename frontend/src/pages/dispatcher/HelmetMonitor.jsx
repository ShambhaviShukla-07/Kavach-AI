import { useCallback, useEffect, useState } from 'react'
import api from '../../services/api'

const severityClass = {
  low: 'text-green-400',
  medium: 'text-yellow-400',
  high: 'text-orange-400',
  critical: 'text-red-400'
}

export default function HelmetMonitor() {
  const [events, setEvents] = useState([])
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [eventsRes, statsRes] = await Promise.all([
        api.get('/helmet/events'),
        api.get('/helmet/stats')
      ])

      setEvents(eventsRes.data.data || [])
      setStats(statsRes.data.data || null)
    } catch (err) {
      setError(
        err.response?.data?.message || err.message
      )
    }
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, 10000)
    return () => clearInterval(timer)
  }, [load])

  const setStatus = async (id, status) => {
    try {
      await api.patch(`/helmet/events/${id}/status`, { status })
      load()
    } catch (err) {
      setError(err.response?.data?.message || err.message)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">
          Helmet Crash Monitor
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          ML-classified impact events from paired helmets.
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Total events" value={stats.total} />
          <Stat label="Crashes" value={stats.crashes} />
          <Stat label="Last 24 hours" value={stats.last24h} />
          <Stat label="New / unacknowledged" value={stats.newEvents} />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="text-left p-3">Time</th>
              <th className="text-left p-3">Device</th>
              <th className="text-left p-3">Rider</th>
              <th className="text-left p-3">Crash</th>
              <th className="text-left p-3">Confidence</th>
              <th className="text-left p-3">Severity</th>
              <th className="text-left p-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr
                key={event._id}
                className="border-t border-slate-800 text-slate-300"
              >
                <td className="p-3">
                  {new Date(event.createdAt).toLocaleString()}
                </td>
                <td className="p-3">{event.deviceId}</td>
                <td className="p-3">
                  {event.rider?.name || '—'}
                </td>
                <td className="p-3">
                  {event.prediction?.isCrash ? 'YES' : 'no'}
                </td>
                <td className="p-3">
                  {Math.round(
                    (event.prediction?.confidence || 0) * 100
                  )}%
                </td>
                <td
                  className={`p-3 font-semibold ${
                    severityClass[event.prediction?.severity] || ''
                  }`}
                >
                  {event.prediction?.severity}
                </td>
                <td className="p-3">
                  <select
                    value={event.status}
                    onChange={(e) =>
                      setStatus(event._id, e.target.value)
                    }
                    className="bg-slate-900 border border-slate-700 rounded px-2 py-1"
                  >
                    <option value="new">new</option>
                    <option value="acknowledged">acknowledged</option>
                    <option value="dispatched">dispatched</option>
                    <option value="false_alarm">false alarm</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
    </div>
  )
}