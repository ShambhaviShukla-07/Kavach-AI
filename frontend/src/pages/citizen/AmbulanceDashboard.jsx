import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  FiActivity,
  FiMapPin,
  FiTruck,
  FiClock,
  FiNavigation,
  FiShield,
  FiAlertCircle,
  FiRefreshCw,
  FiExternalLink,
  FiAward,
} from 'react-icons/fi'

import RequestAmbulance from './RequestAmbulance'
import { emergencyService } from '../../services/emergencyService'
import api from '../../services/api'
import { useGeolocation } from '../../hooks/useGeolocation'

const statusStyles = {
  pending: 'text-amber-300 bg-amber-400/10 border-amber-400/20',
  dispatched: 'text-blue-300 bg-blue-400/10 border-blue-400/20',
  en_route: 'text-cyan-300 bg-cyan-400/10 border-cyan-400/20',
  arrived: 'text-emerald-300 bg-emerald-400/10 border-emerald-400/20',
  resolved: 'text-green-300 bg-green-400/10 border-green-400/20',
  cancelled: 'text-red-300 bg-red-400/10 border-red-400/20',
}

const statusLabels = {
  pending: 'Pending',
  dispatched: 'Ambulance Assigned',
  en_route: 'Ambulance En Route',
  arrived: 'Ambulance Arrived',
  resolved: 'Resolved',
  cancelled: 'Cancelled',
}

const extractData = response => {
  const body = response?.data

  if (body?.success === false) {
    throw new Error(body.message || 'Request failed')
  }

  return body?.data ?? body?.payload ?? body
}

const getDistanceKm = (first, second) => {
  if (
    !Array.isArray(first) ||
    !Array.isArray(second) ||
    first.length < 2 ||
    second.length < 2
  ) {
    return null
  }

  const [lon1, lat1] = first
  const [lon2, lat2] = second

  if (
    ![lon1, lat1, lon2, lat2].every(Number.isFinite) ||
    lon1 < -180 ||
    lon1 > 180 ||
    lon2 < -180 ||
    lon2 > 180 ||
    lat1 < -90 ||
    lat1 > 90 ||
    lat2 < -90 ||
    lat2 > 90 ||
    (lon1 === 0 && lat1 === 0) ||
    (lon2 === 0 && lat2 === 0)
  ) {
    return null
  }

  const toRadians = value => (value * Math.PI) / 180

  const dLat = toRadians(lat2 - lat1)
  const dLon = toRadians(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2

  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const formatStatus = status =>
  statusLabels[status] || status?.replaceAll('_', ' ') || 'Unknown'

const features = [
  {
    title: 'Nearby Ambulances',
    description: 'View available ambulances ranked by distance.',
    icon: FiMapPin,
  },
  {
    title: 'Live Availability',
    description: 'View availability information from the backend.',
    icon: FiTruck,
  },
  {
    title: 'Emergency Status',
    description: 'Check the status of your emergency request.',
    icon: FiActivity,
  },
  {
    title: 'Location Tracking',
    description: 'Open available emergency location links.',
    icon: FiNavigation,
  },
]

export default function AmbulanceDashboard() {
  const [showRequestForm, setShowRequestForm] = useState(true)
  const [emergencies, setEmergencies] = useState([])
  const [ambulances, setAmbulances] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const { location } = useGeolocation()

  const loadDashboard = useCallback(async (manualRefresh = false) => {
    if (manualRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    setError('')

    try {
      const results = await Promise.allSettled([
        emergencyService.getAll(),
        api.get('/ambulance/available'),
      ])

      const failed = []

      if (results[0].status === 'fulfilled') {
        const data = extractData(results[0].value)

        setEmergencies(Array.isArray(data) ? data : [])
      } else {
        failed.push('emergency requests')
      }

      if (results[1].status === 'fulfilled') {
        const data = extractData(results[1].value)

        const list = Array.isArray(data)
          ? data
          : Array.isArray(data?.ambulances)
            ? data.ambulances
            : []

        setAmbulances(list)
      } else {
        failed.push('available ambulances')
      }

      if (failed.length) {
        setError(
          `Could not load ${failed.join(' and ')}. Please try refreshing.`
        )
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          'Unable to load dashboard data.'
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadDashboard()

    const interval = setInterval(() => {
      loadDashboard(true)
    }, 30000)

    return () => clearInterval(interval)
  }, [loadDashboard])

  const activeEmergency = emergencies.find(emergency =>
    ['pending', 'dispatched', 'en_route', 'arrived'].includes(
      emergency.status
    )
  )

  // Calculate distance and sort the available ambulances.
  const sortedAmbulances = [...ambulances]
    .map(ambulance => {
      const ambulanceCoordinates = ambulance.location?.coordinates
      const userCoordinates = location?.coordinates

      const validUserLocation =
        Array.isArray(userCoordinates) &&
        userCoordinates.length === 2 &&
        userCoordinates.every(Number.isFinite) &&
        !(userCoordinates[0] === 0 && userCoordinates[1] === 0)

      return {
        ...ambulance,
        distanceKm: validUserLocation
          ? getDistanceKm(userCoordinates, ambulanceCoordinates)
          : null,
      }
    })
    .sort((a, b) => {
      if (a.distanceKm == null && b.distanceKm == null) return 0
      if (a.distanceKm == null) return 1
      if (b.distanceKm == null) return -1

      return a.distanceKm - b.distanceKm
    })

  const rankedAmbulances = sortedAmbulances.filter(
    ambulance => ambulance.distanceKm != null
  )

  const activeLocation =
    activeEmergency?.assignedAmbulance?.location?.coordinates ||
    activeEmergency?.location?.coordinates

  const mapUrl =
    Array.isArray(activeLocation) &&
    activeLocation.length === 2 &&
    activeLocation.every(Number.isFinite) &&
    !(activeLocation[0] === 0 && activeLocation[1] === 0)
      ? `https://www.google.com/maps?q=${activeLocation[1]},${activeLocation[0]}`
      : ''

  const cards = [
    {
      label: 'Available Ambulances',
      value: ambulances.length,
      icon: FiTruck,
      color: 'text-cyan-400',
    },
    {
      label: 'Active Emergency',
      value: activeEmergency ? 'Active' : 'None',
      icon: FiActivity,
      color: 'text-amber-400',
    },
    {
      label: 'My Requests',
      value: emergencies.length,
      icon: FiAlertCircle,
      color: 'text-blue-400',
    },
    {
      label: 'Current Status',
      value: activeEmergency
        ? formatStatus(activeEmergency.status)
        : 'No active request',
      icon: FiClock,
      color: 'text-emerald-400',
    },
  ]

  return (
    <div className="space-y-7 pb-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-cyan-400">
            <FiActivity />

            <span className="text-xs font-bold uppercase tracking-[0.2em]">
              Emergency Response
            </span>
          </div>

          <h1 className="text-2xl font-black text-white sm:text-3xl">
            Ambulance Dashboard
          </h1>

          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Request emergency assistance and monitor your emergency requests.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => loadDashboard(true)}
            disabled={refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm text-white hover:bg-white/5 disabled:opacity-50"
          >
            <FiRefreshCw className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>

          <button
            type="button"
            onClick={() => setShowRequestForm(value => !value)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-300 hover:bg-cyan-400/20"
          >
            <FiAlertCircle />

            {showRequestForm ? 'Hide Request Form' : 'Request Emergency Help'}
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-400/20 bg-red-400/5 p-4">
          <FiAlertCircle className="mt-0.5 shrink-0 text-red-400" />

          <div>
            <p className="text-sm text-red-300">{error}</p>

            <p className="mt-1 text-xs text-slate-400">
              Check that the backend is running and your session is authenticated.
            </p>
          </div>
        </div>
      )}

      {/* Overview cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((item, index) => {
          const Icon = item.icon

          return (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06 }}
              className="rounded-2xl border border-white/10 bg-slate-900/60 p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-slate-400">{item.label}</p>

                <Icon className={`text-xl ${item.color}`} />
              </div>

              <p className="mt-4 break-words text-lg font-bold capitalize text-white">
                {loading ? 'Loading...' : item.value}
              </p>
            </motion.div>
          )
        })}
      </div>

      {/* NEW: Ambulance Ranking - visible above the request form */}
      <section className="rounded-2xl border border-cyan-400/20 bg-slate-900/70 p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <FiAward className="text-2xl text-cyan-400" />

              <h2 className="text-lg font-bold text-white sm:text-xl">
                Nearby Ambulance Ranking
              </h2>
            </div>

            <p className="mt-2 text-sm text-slate-400">
              Ambulances are ranked using their distance from your location.
            </p>
          </div>

          <span className="w-fit rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-300">
            {loading ? 'Loading...' : `${ambulances.length} Available`}
          </span>
        </div>

        {!location?.coordinates ? (
          <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
            <p className="font-semibold text-amber-300">
              Location permission required
            </p>

            <p className="mt-1 text-sm text-slate-400">
              Allow location access in your browser to calculate distances
              and rank ambulances by proximity.
            </p>
          </div>
        ) : loading ? (
          <div className="py-8 text-center text-sm text-slate-400">
            Calculating ambulance rankings...
          </div>
        ) : sortedAmbulances.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-white/15 p-6 text-center">
            <FiTruck className="mx-auto text-3xl text-slate-500" />

            <p className="mt-3 font-semibold text-white">
              No available ambulances
            </p>

            <p className="mt-2 text-sm text-slate-400">
              Ambulances marked as available will appear here.
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {sortedAmbulances.map((ambulance, index) => {
              const hasDistance = ambulance.distanceKm != null
              const isNearest = index === 0 && hasDistance

              return (
                <div
                  key={ambulance._id || ambulance.id || index}
                  className={`flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4 ${
                    isNearest
                      ? 'border-cyan-400/30 bg-cyan-400/5'
                      : 'border-white/10 bg-white/[0.03]'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl font-black ${
                        isNearest
                          ? 'bg-cyan-400 text-slate-950'
                          : 'bg-slate-800 text-cyan-300'
                      }`}
                    >
                      #{index + 1}
                    </div>

                    <div className="min-w-0">
                      <p className="break-words font-bold text-white">
                        {ambulance.vehicleNumber || 'Ambulance'}
                      </p>

                      <p className="mt-1 text-xs text-slate-400">
                        Driver:{' '}
                        {typeof ambulance.driver === 'object'
                          ? ambulance.driver?.name || 'Not assigned'
                          : ambulance.driver || 'Not assigned'}
                      </p>

                      <p className="mt-1 text-sm font-semibold text-cyan-300">
                        {hasDistance
                          ? `${ambulance.distanceKm.toFixed(2)} km away`
                          : 'Distance unavailable'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-start gap-2 sm:items-end">
                    {isNearest && (
                      <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-bold text-cyan-300">
                        NEAREST
                      </span>
                    )}

                    <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold capitalize text-emerald-300">
                      {ambulance.status || 'available'}
                    </span>

                    {Array.isArray(ambulance.location?.coordinates) &&
                      ambulance.location.coordinates.length === 2 &&
                      ambulance.location.coordinates.every(Number.isFinite) &&
                      !(ambulance.location.coordinates[0] === 0 &&
                        ambulance.location.coordinates[1] === 0) && (
                        <a
                          href={`https://www.google.com/maps?q=${ambulance.location.coordinates[1]},${ambulance.location.coordinates[0]}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200"
                        >
                          <FiExternalLink />
                          View location
                        </a>
                      )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {rankedAmbulances.length > 0 && (
          <p className="mt-4 text-xs text-slate-400">
            {rankedAmbulances.length} ambulance(s) have valid coordinates and
            can be ranked by distance.
          </p>
        )}

        <p className="mt-3 text-xs leading-5 text-slate-500">
          Distances are straight-line estimates, not actual road distances or
          live traffic ETAs. Ambulances without valid location coordinates
          cannot be accurately ranked.
        </p>
      </section>

      {/* Main dashboard */}
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-5">
        <div className="space-y-6 xl:col-span-3">
          {/* Request form */}
          {showRequestForm && (
            <section className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 sm:p-6">
              <h2 className="mb-5 text-lg font-bold text-white">
                Request Emergency Help
              </h2>

              <RequestAmbulance />
            </section>
          )}

          {/* Available ambulances */}
          <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white">
                  Available Ambulances
                </h2>

                <p className="mt-1 text-sm text-slate-400">
                  Current availability from the ambulance API.
                </p>
              </div>

              <FiTruck className="text-xl text-cyan-400" />
            </div>

            {loading ? (
              <p className="py-8 text-center text-sm text-slate-400">
                Loading ambulances...
              </p>
            ) : sortedAmbulances.length === 0 ? (
              <div className="mt-5 rounded-xl border border-dashed border-white/15 p-6 text-center">
                <p className="font-semibold text-white">
                  No available ambulances found
                </p>

                <p className="mt-2 text-sm text-slate-400">
                  Check ambulance availability in the dispatcher dashboard.
                </p>
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {sortedAmbulances.map(ambulance => (
                  <div
                    key={ambulance._id || ambulance.id}
                    className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="rounded-xl bg-cyan-400/10 p-3 text-cyan-300">
                          <FiTruck className="text-xl" />
                        </div>

                        <div>
                          <p className="font-semibold text-white">
                            {ambulance.vehicleNumber || 'Ambulance'}
                          </p>

                          <p className="mt-1 text-xs text-slate-400">
                            Driver:{' '}
                            {typeof ambulance.driver === 'object'
                              ? ambulance.driver?.name || 'Not assigned'
                              : ambulance.driver || 'Not assigned'}
                          </p>

                          <p className="mt-1 text-xs text-slate-400">
                            {ambulance.distanceKm != null
                              ? `${ambulance.distanceKm.toFixed(2)} km from your location`
                              : 'Distance unavailable'}
                          </p>
                        </div>
                      </div>

                      <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs capitalize text-emerald-300">
                        {ambulance.status || 'available'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          
      {/* My Emergency Requests - Show Only Latest 3 */}
      <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">
              Recent Emergency Requests
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Showing your 3 most recent requests.
            </p>
          </div>

          <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-300">
            {Math.min(emergencies.length, 3)} Recent
          </span>
        </div>

        {loading ? (
          <p className="py-6 text-sm text-slate-400">
            Loading requests...
          </p>
        ) : emergencies.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-white/15 p-5 text-sm text-slate-400">
            You have no emergency requests yet.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {[...emergencies]
              .sort(
                (a, b) =>
                  new Date(b.createdAt || 0).getTime() -
                  new Date(a.createdAt || 0).getTime()
              )
              .slice(0, 3)
              .map((emergency, index) => (
                <div
                  key={emergency._id || emergency.id || index}
                  className="rounded-xl border border-white/10 bg-white/[0.02] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold capitalize text-white">
                        {(emergency.type || 'Emergency').replaceAll(
                          '_',
                          ' '
                        )}
                      </p>

                      <p className="mt-1 text-xs text-slate-400">
                        {emergency.createdAt
                          ? new Date(
                              emergency.createdAt
                            ).toLocaleString()
                          : 'Date unavailable'}
                      </p>
                    </div>

                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                        statusStyles[emergency.status] ||
                        'border-white/10 bg-white/5 text-slate-300'
                      }`}
                    >
                      {formatStatus(emergency.status)}
                    </span>
                  </div>

                  {emergency.description && (
                    <p className="mt-3 text-sm text-slate-400">
                      {emergency.description}
                    </p>
                  )}

                  {emergency.assignedAmbulance && (
                    <p className="mt-2 text-xs text-cyan-300">
                      Assigned vehicle:{' '}
                      {emergency.assignedAmbulance.vehicleNumber ||
                        'Ambulance assigned'}
                    </p>
                  )}
                </div>
              ))}
          </div>
        )}
      </section>
         
          
        </div>

        {/* Right column */}
        <div className="space-y-6 xl:col-span-2">
          {/* Active emergency */}
          <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-amber-400/10 p-3 text-amber-300">
                <FiActivity className="text-xl" />
              </div>

              <div>
                <h2 className="font-bold text-white">Active Emergency</h2>

                <p className="text-xs text-slate-400">
                  Latest active request
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              {loading ? (
                <p className="text-sm text-slate-400">Loading status...</p>
              ) : activeEmergency ? (
                <>
                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                      statusStyles[activeEmergency.status] ||
                      'border-white/10 text-slate-300'
                    }`}
                  >
                    {formatStatus(activeEmergency.status)}
                  </span>

                  <p className="mt-3 text-sm text-white">
                    Type:{' '}
                    <span className="capitalize">
                      {activeEmergency.type || 'Emergency'}
                    </span>
                  </p>

                  <p className="mt-2 text-sm text-slate-400">
                    Severity: {activeEmergency.severity || 'Unknown'}
                  </p>

                  {activeEmergency.assignedAmbulance && (
                    <p className="mt-2 text-sm text-cyan-300">
                      Vehicle:{' '}
                      {activeEmergency.assignedAmbulance.vehicleNumber ||
                        'Assigned'}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-slate-400">
                  No active emergency request.
                </p>
              )}
            </div>
          </section>

          {/* Location and tracking */}
          <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-cyan-400/10 p-3 text-cyan-300">
                <FiMapPin className="text-xl" />
              </div>

              <div>
                <h2 className="font-bold text-white">Location & Tracking</h2>

                <p className="text-xs text-slate-400">
                  Available location information
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              {activeEmergency?.location?.coordinates && (
                <p className="text-sm text-slate-300">
                  Emergency location saved.
                </p>
              )}

              {activeEmergency?.assignedAmbulance?.location?.coordinates && (
                <p className="mt-2 text-sm text-cyan-300">
                  Assigned ambulance location available.
                </p>
              )}

              {mapUrl ? (
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-cyan-400/10 px-3 py-2 text-sm text-cyan-300 hover:bg-cyan-400/20"
                >
                  <FiExternalLink />
                  Open location in Google Maps
                </a>
              ) : (
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  A valid emergency or assigned ambulance location is not
                  available yet.
                </p>
              )}
            </div>
          </section>

          {/* Module features */}
          <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-5">
            <h2 className="font-bold text-white">Module Features</h2>

            <div className="mt-4 space-y-4">
              {features.map(({ title, description, icon: Icon }) => (
                <div key={title} className="flex items-start gap-3">
                  <div className="rounded-lg bg-white/5 p-2 text-cyan-300">
                    <Icon />
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-white">
                      {title}
                    </p>

                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      {description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="flex items-start gap-3 rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-4">
            <FiShield className="mt-0.5 shrink-0 text-cyan-300" />

            <p className="text-xs leading-5 text-slate-400">
              Ambulance rankings use available location coordinates. The
              displayed distance is a straight-line estimate; actual road
              routes and live traffic ETAs are not calculated.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}