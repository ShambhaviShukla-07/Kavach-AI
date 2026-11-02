import { useEffect, useState } from 'react'
import { FiRadio, FiAlertCircle, FiAlertTriangle, FiMessageSquare, FiBell, FiClock, FiActivity, FiCheck, FiCheckCircle } from 'react-icons/fi'

import { helmetService } from '../services/helmetService'
import api from '../services/api'
import StatCard from './ui/StatCard'
import { StatusBadge, SeverityBadge } from './ui/SeverityBadge'
import Loader from './common/Loader'

// Short interval so the buzzer ON state is visible during the 15 s countdown.
const POLL_MS = 3000

const timeAgo = (value) => {
  if (!value) return 'Never'
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`
  return new Date(value).toLocaleDateString()
}

const mapUrl = (lat, lng) =>
  `https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`

const incidentHistory = (incident) => {
  if (incident.statusHistory?.length) return incident.statusHistory

  const history = [{
    status: 'pending',
    changedAt: incident.createdAt,
    source: 'helmet',
    changedBy: null
  }]

  if (incident.status !== 'pending') {
    history.push({
      status: incident.status,
      changedAt: incident.resolvedAt || incident.updatedAt,
      source: 'system',
      changedBy: null
    })
  }

  return history
}

const incidentStatusLabel = (status) => ({
  pending: 'SOS received',
  acknowledged: 'Acknowledged',
  dispatched: 'Dispatched',
  en_route: 'En route',
  arrived: 'Arrived',
  resolved: 'Resolved',
  cancelled: 'Cancelled'
}[status] || status)

const isOpenIncident = (incident) => ['pending', 'acknowledged'].includes(incident.status)

function SosActions({ incident, busy, onUpdate }) {
  if (incident.status === 'pending') {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => onUpdate(incident, 'acknowledged')}
        className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-400 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
      >
        <FiCheck /> Acknowledge
      </button>
    )
  }

  if (incident.status === 'acknowledged') {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => onUpdate(incident, 'resolved')}
        className="inline-flex items-center gap-1.5 rounded-lg bg-green-400 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-green-300 disabled:opacity-50"
      >
        <FiCheckCircle /> Resolve
      </button>
    )
  }

  return <span className="text-xs text-slate-500">Closed</span>
}

function IncidentTimeline({ incident }) {
  return (
    <ol className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
      {incidentHistory(incident).map((entry, index) => {
        const actor = entry.source === 'helmet'
          ? incident.deviceId || 'Helmet'
          : entry.changedBy?.name || entry.source

        return (
          <li key={`${entry.status}-${entry.changedAt}-${index}`} className="text-xs text-slate-400">
            <span className="font-semibold text-slate-300">{incidentStatusLabel(entry.status)}</span>
            <span> · {actor} · {new Date(entry.changedAt).toLocaleString()}</span>
          </li>
        )
      })}
    </ol>
  )
}

function HealthRow({ label, value, valueClass = 'text-white' }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-700/30 last:border-0">
      <span className="text-slate-400 text-sm">{label}</span>
      <span className={`text-sm font-semibold ${valueClass}`}>{value}</span>
    </div>
  )
}

function DeviceSection({ device }) {
  const { latitude, longitude, speedKmh, recordedAt } = device.location || {}
  const hasLocation = Number.isFinite(latitude) && Number.isFinite(longitude)

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="glass rounded-2xl p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-white font-bold">Helmet Location · {device.deviceId}</h3>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full border text-cyan-400 bg-cyan-400/10 border-cyan-400/20">
              GPS Tracking
            </span>
          </div>
          <p className="text-slate-500 text-xs mb-4">Latest GPS data from server</p>

          {hasLocation ? (
            <>
              <div className="grid sm:grid-cols-2 gap-3 mb-4 text-sm">
                <div className="rounded-xl bg-slate-800/40 border border-slate-700/40 px-4 py-3">
                  <div className="text-slate-500 text-xs">Latitude</div>
                  <div className="text-white font-semibold">{latitude.toFixed(6)}</div>
                </div>
                <div className="rounded-xl bg-slate-800/40 border border-slate-700/40 px-4 py-3">
                  <div className="text-slate-500 text-xs">Longitude</div>
                  <div className="text-white font-semibold">{longitude.toFixed(6)}</div>
                </div>
              </div>

              <iframe
                key={`${latitude},${longitude}`}
                title={`Helmet ${device.deviceId} location`}
                src={mapUrl(latitude, longitude)}
                referrerPolicy="no-referrer-when-downgrade"
                style={{ border: 0 }}
                className="block w-full h-64 rounded-xl"
              />

              <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
                <span>Updated {timeAgo(recordedAt)}</span>
                <a
                  href={`https://maps.google.com/?q=${latitude},${longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-400 text-sm hover:text-cyan-300"
                >
                  Open location in Google Maps
                </a>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-700 p-10 text-center text-slate-500 text-sm">
              Waiting for a GPS fix from the helmet.
            </div>
          )}
        </div>

        <div className="glass rounded-2xl p-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-white font-bold">Device Health</h3>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full border text-slate-300 bg-slate-400/10 border-slate-400/20">
              {device.deviceId}
            </span>
          </div>
          <p className="text-slate-500 text-xs mb-4">Helmet {device.deviceId} · live server record</p>

          <div className="rounded-xl bg-slate-800/40 border border-slate-700/40 px-4 py-3 mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-cyan-400/10 flex items-center justify-center text-cyan-400">
                <FiRadio />
              </div>
              <div className="text-white font-semibold text-sm">Smart Helmet {device.deviceId}</div>
            </div>
            <StatusBadge status={device.online ? 'online' : 'offline'} />
          </div>

          <HealthRow
            label="ESP32 connection"
            value={device.online ? 'Online' : 'Offline'}
            valueClass={device.online ? 'text-green-400' : 'text-red-400'}
          />
          <HealthRow label="GPS records" value={`${device.gpsPoints} points`} />
          <HealthRow
            label="Buzzer"
            value={device.buzzerActive ? 'ON · countdown / SOS' : 'Off'}
            valueClass={device.buzzerActive ? 'text-red-400 animate-pulse' : 'text-slate-300'}
          />
          <HealthRow label="Speed" value={Number.isFinite(speedKmh) ? `${Math.round(speedKmh)} km/h` : '—'} />
          <HealthRow label="Last seen" value={timeAgo(device.lastSeen)} />
        </div>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FiMessageSquare className="text-cyan-400" />
            <h3 className="text-white font-bold">SMS Logs</h3>
          </div>
          <span className="text-xs text-slate-500">Latest 5 shown · scroll for older</span>
        </div>
        {device.smsResults.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No SMS alerts sent yet.</div>
        ) : (
          <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-700/30" aria-label="SMS logs">
            {device.smsResults.map((result) => (
              <div
                key={`${result.eventId}-${result.contactIndex}`}
                className="h-[60px] px-6 flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="text-white text-sm">
                    Contact {result.contactIndex} · {result.contactNumber}
                  </div>
                  <div className="text-slate-500 text-xs truncate">
                    {result.modemResponse || result.eventId} · {timeAgo(result.receivedAt)}
                  </div>
                </div>
                <span
                  className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                    result.status === 'SENT'
                      ? 'text-green-400 bg-green-400/10 border-green-400/20'
                      : 'text-red-400 bg-red-400/10 border-red-400/20'
                  }`}
                >
                  {result.status === 'SENT' ? 'Sent' : 'Failed'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function HelmetDashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [updatingIncidentId, setUpdatingIncidentId] = useState('')

  const updateIncidentStatus = async (incident, status) => {
    setUpdatingIncidentId(incident._id)
    setActionError('')

    try {
      const response = await api.put(`/emergency/${incident._id}/status`, { status })
      const updatedIncident = response.data.data
      const wasOpen = !['resolved', 'cancelled'].includes(incident.status)
      const isOpen = !['resolved', 'cancelled'].includes(updatedIncident.status)

      setData((current) => ({
        ...current,
        summary: {
          ...current.summary,
          openEmergencies: Math.max(
            0,
            current.summary.openEmergencies + Number(isOpen) - Number(wasOpen)
          )
        },
        incidents: current.incidents.map((item) =>
          item._id === updatedIncident._id ? { ...item, ...updatedIncident } : item
        )
      }))
    } catch (err) {
      setActionError(err.response?.data?.message || 'Could not update this alert')
    } finally {
      setUpdatingIncidentId('')
    }
  }

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const response = await helmetService.getDeviceStatus()
        if (!cancelled) {
          setData(response.data.data)
          setError('')
        }
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || 'Failed to load helmet status')
      }
    }

    load()
    const timer = setInterval(load, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  if (!data && !error) return <Loader />

  if (error && !data) {
    return <div className="glass rounded-2xl p-6 text-red-400 text-sm">{error}</div>
  }

  const { summary, devices, incidents } = data
  const primary = devices[0]
  const activeIncidents = incidents.filter(isOpenIncident)

  if (devices.length === 0 && incidents.length === 0) {
    return (
      <div className="glass rounded-2xl p-12 text-center text-slate-500">
        No helmet connected yet. Power on the helmet and make sure it can reach the server.
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {activeIncidents.map((incident) => (
        <section
          key={incident._id}
          role="alert"
          className="rounded-2xl border-2 border-red-500 bg-red-500/10 p-5 shadow-[0_0_30px_rgba(239,68,68,0.25)]"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-12 h-12 shrink-0 rounded-xl bg-red-500 text-white flex items-center justify-center text-2xl animate-pulse">
                <FiAlertTriangle />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-black text-red-300">
                  SOS ALERT · {incident.deviceId || 'Helmet'}
                </h2>
                <p className="text-sm text-slate-300">
                  {incident.deviceId || 'Helmet'} ne SOS bheja · {new Date(incident.createdAt).toLocaleString()} ({timeAgo(incident.createdAt)})
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{incident.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={incident.status} />
              <SosActions
                incident={incident}
                busy={updatingIncidentId === incident._id}
                onUpdate={updateIncidentStatus}
              />
            </div>
          </div>
          {actionError && <p className="mt-3 text-sm text-red-300">{actionError}</p>}
          <IncidentTimeline incident={incident} />
        </section>
      ))}

      <div className="flex items-center gap-2 text-xs text-slate-500">
        <FiActivity className="text-cyan-400" />
        Auto-refresh every {POLL_MS / 1000} seconds
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Registered Helmets" value={summary.registeredHelmets} icon={<FiRadio />} />
        <StatCard
          title={primary ? `Device ${primary.deviceId} Status` : 'Device Status'}
          value={primary?.online ? 'Online' : 'Offline'}
          icon={primary?.buzzerActive ? <FiBell /> : <FiClock />}
          color={primary?.online ? 'text-green-400' : 'text-slate-400'}
          trend={primary ? `Last seen ${timeAgo(primary.lastSeen)}` : undefined}
          delay={0.1}
        />
        <StatCard
          title="Open Emergencies"
          value={summary.openEmergencies}
          icon={<FiAlertCircle />}
          color="text-red-400"
          delay={0.2}
        />
        <StatCard
          title="SMS Log Records"
          value={summary.smsLogRecords}
          icon={<FiMessageSquare />}
          color="text-yellow-400"
          delay={0.3}
        />
      </div>

      {devices.map((device) => (
        <DeviceSection key={device.deviceId} device={device} />
      ))}

      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between gap-3">
          <h3 className="text-white font-bold">Helmet SOS Alerts</h3>
          <span className="text-xs text-slate-500">{incidents.length} recent · 5 visible</span>
        </div>
        {actionError && (
          <p role="alert" className="px-6 py-3 text-sm text-red-400 border-b border-slate-700/50">
            {actionError}
          </p>
        )}
        {incidents.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No H1 SOS has reached the server yet.</div>
        ) : (
          <div className="max-h-[400px] overflow-y-auto divide-y divide-slate-700/30" aria-label="Recent helmet SOS alerts">
            {incidents.map((incident) => (
              <div
                key={incident._id}
                className={`min-h-[80px] px-6 py-3 flex flex-wrap items-center justify-between gap-3 ${
                  isOpenIncident(incident) ? 'bg-red-500/5' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-white font-bold text-sm">{incident.deviceId || 'Helmet'} SOS</span>
                    <StatusBadge status={incident.status} />
                    <SeverityBadge severity={incident.severity} />
                    <span className="text-xs text-slate-500">
                      {new Date(incident.createdAt).toLocaleString()}
                      {incident.citizen?.name ? ` · Rider ${incident.citizen.name}` : ''}
                    </span>
                  </div>
                  <IncidentTimeline incident={incident} />
                </div>
                <SosActions
                  incident={incident}
                  busy={updatingIncidentId === incident._id}
                  onUpdate={updateIncidentStatus}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
