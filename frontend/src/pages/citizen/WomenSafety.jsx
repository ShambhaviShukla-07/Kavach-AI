import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  FiShield,
  FiPlus,
  FiTrash2,
  FiSave,
  FiMapPin,
  FiClock,
  FiCheckCircle,
  FiAlertTriangle,
  FiNavigation,
  FiPhone,
  FiActivity,
  FiRefreshCw,
  FiMail,
  FiExternalLink,
} from 'react-icons/fi'

import { womenSafetyService } from '../../services/womenSafetyService'
import { useGeolocation } from '../../hooks/useGeolocation'
import { StatusBadge } from '../../components/ui/SeverityBadge'
import VoiceSosButton from '../../components/VoiceSosButton'
import { useVoiceAssistant } from '../../hooks/useVoiceAssistant'
import Loader from '../../components/common/Loader'
import toast from 'react-hot-toast'

const inputClass =
  'w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-pink-400 focus:ring-2 focus:ring-pink-400/20'

const emptyContact = () => ({
  name: '',
  phone: '',
  email: '',
})

export default function WomenSafety() {
  const { location } = useGeolocation()

  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [sosLoading, setSosLoading] = useState(false)
  const [resolvingId, setResolvingId] = useState(null)
  const { speak } = useVoiceAssistant()
  const [contacts, setContacts] = useState([emptyContact()])
  const [contactsLoading, setContactsLoading] = useState(true)
  const [savingContacts, setSavingContacts] = useState(false)

  useEffect(() => {
    let mounted = true

    const loadData = async () => {
      try {
        const [alertsResult, contactsResult] =
          await Promise.allSettled([
            womenSafetyService.getMySOS(),
            womenSafetyService.getEmergencyContacts(),
          ])

        if (!mounted) return

        if (alertsResult.status === 'fulfilled') {
          const data = alertsResult.value.data.data
          setAlerts(Array.isArray(data) ? data : [])
        } else {
          toast.error('Could not load SOS history')
        }

        if (contactsResult.status === 'fulfilled') {
          const data = contactsResult.value.data.data

          setContacts(
            Array.isArray(data) && data.length
              ? data.map((contact) => ({
                  name: contact.name || '',
                  phone: contact.phone || '',
                  email: contact.email || '',
                }))
              : [emptyContact()]
          )
        } else {
          toast.error('Could not load emergency contacts')
        }
      } catch {
        if (mounted) {
          toast.error('Failed to load Women Safety data')
        }
      } finally {
        if (mounted) {
          setLoading(false)
          setContactsLoading(false)
        }
      }
    }

    loadData()

    return () => {
      mounted = false
    }
  }, [])

  const updateContact = (index, field, value) => {
    setContacts((previous) =>
      previous.map((contact, i) =>
        i === index
          ? { ...contact, [field]: value }
          : contact
      )
    )
  }

  const addContact = () => {
    if (contacts.length >= 10) {
      toast.error('Maximum 10 contacts allowed')
      return
    }

    setContacts((previous) => [
      ...previous,
      emptyContact(),
    ])
  }

  const deleteContact = (index) => {
    setContacts((previous) => {
      const updated = previous.filter((_, i) => i !== index)
      return updated.length ? updated : [emptyContact()]
    })
  }

  const saveContacts = async () => {
    const filledContacts = contacts
      .filter(
        (contact) =>
          contact.name.trim() ||
          contact.phone.trim() ||
          contact.email.trim()
      )
      .map((contact) => ({
        name: contact.name.trim(),
        phone: contact.phone.trim(),
        email: contact.email.trim().toLowerCase(),
      }))

    if (
      filledContacts.some(
        (contact) => !contact.name || !contact.phone
      )
    ) {
      toast.error('Name and phone are required for each contact')
      return
    }

    if (filledContacts.length > 10) {
      toast.error('Maximum 10 contacts allowed')
      return
    }

    setSavingContacts(true)

    try {
      const response =
        await womenSafetyService.saveEmergencyContacts(
          filledContacts
        )

      const savedContacts = response.data.data

      setContacts(
        Array.isArray(savedContacts) && savedContacts.length
          ? savedContacts.map((contact) => ({
              name: contact.name || '',
              phone: contact.phone || '',
              email: contact.email || '',
            }))
          : filledContacts.length
            ? filledContacts
            : [emptyContact()]
      )

      toast.success('Emergency contacts saved')
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          'Failed to save contacts'
      )
    } finally {
      setSavingContacts(false)
    }
  }

  const triggerSOS = async () => {
    if (sosLoading) return false

    if (!location) {
      toast.error('Allow location access before triggering SOS')
      speak('Location is not ready. Allow location access before using SOS.')
      return false
    }

    // Name, phone AND email are sent to backend
    const filledContacts = contacts
      .filter(
        (contact) =>
          contact.name.trim() && contact.phone.trim()
      )
      .map((contact) => ({
        name: contact.name.trim(),
        phone: contact.phone.trim(),
        email: contact.email?.trim().toLowerCase() || '',
      }))

    setSosLoading(true)

    try {
      const response = await womenSafetyService.triggerSOS({
        coordinates: location.coordinates,
        address: `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`,
        mapsUrl: `https://www.google.com/maps?q=${location.lat},${location.lng}`,
        emergencyContacts: filledContacts,
      })

      const result = response.data.data

      if (result?.sos) {
        setAlerts((previous) => [
          result.sos,
          ...previous,
        ])
      }

      if (result?.messaging?.sms === 'not_configured') {
        toast.success(
          'SOS saved. SMS notifications are not configured.'
        )
      } else {
        toast.success('SOS alert triggered successfully')
      }

      speak(
        `SOS alert created. Your location is ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}. If this is life threatening, call 112.`
      )

      return true
    } catch (error) {
      toast.error(
        error.response?.data?.message || 'SOS failed'
      )
      speak('SOS failed. Call 112 if you are in danger.')
      return false
    } finally {
      setSosLoading(false)
    }
  }

  const resolveAlert = async (id) => {
    if (resolvingId) return

    setResolvingId(id)

    try {
      await womenSafetyService.resolveSOS(id)

      setAlerts((previous) =>
        previous.map((alert) =>
          alert._id === id
            ? { ...alert, status: 'resolved' }
            : alert
        )
      )

      toast.success('SOS alert resolved')
      speak('SOS alert resolved.')
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          'Failed to resolve alert'
      )
    } finally {
      setResolvingId(null)
    }
  }

  const activeAlerts = alerts.filter(
    (alert) => alert.status === 'active'
  ).length

  const resolvedAlerts = alerts.filter(
    (alert) => alert.status === 'resolved'
  ).length

  const savedContactsCount = contacts.filter(
    (contact) =>
      contact.name.trim() && contact.phone.trim()
  ).length

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-10 text-white">

      {/* Header */}
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-pink-400">
            <FiShield className="text-lg" />
            KavachAI / Personal Protection
          </div>

          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
            Women Safety
          </h1>

          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
            Your safety, our priority. Manage emergency contacts,
            share your location and access your SOS history.
          </p>
        </div>

        <div className="flex w-fit items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="text-sm font-medium text-emerald-300">
            Safety Centre Active
          </span>
        </div>
      </header>

      {/* Statistics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          icon={<FiActivity />}
          label="Total SOS Alerts"
          value={alerts.length}
          color="pink"
        />

        <SummaryCard
          icon={<FiAlertTriangle />}
          label="Active Alerts"
          value={activeAlerts}
          color="amber"
        />

        <SummaryCard
          icon={<FiCheckCircle />}
          label="Resolved Alerts"
          value={resolvedAlerts}
          color="emerald"
        />
      </div>

      {/* SOS and Location */}
      <section className="overflow-hidden rounded-3xl border border-pink-500/20 bg-gradient-to-br from-slate-900 via-slate-950 to-pink-950/30">
        <div className="grid grid-cols-1 gap-8 p-5 md:grid-cols-2 md:p-8">

          {/* SOS Button */}
          <div className="flex flex-col items-center justify-center rounded-2xl border border-white/5 bg-slate-950/40 p-6 text-center">
            <span className="mb-5 rounded-full border border-red-400/20 bg-red-400/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-red-300">
              Emergency Assistance
            </span>

            <motion.button
              type="button"
              whileHover={
                !sosLoading && location
                  ? { scale: 1.04 }
                  : undefined
              }
              whileTap={
                !sosLoading && location
                  ? { scale: 0.97 }
                  : undefined
              }
              onClick={triggerSOS}
              disabled={sosLoading || !location}
              aria-label="Trigger emergency SOS"
              className="relative flex h-44 w-44 flex-col items-center justify-center rounded-full border-[7px] border-red-300/20 bg-gradient-to-br from-red-500 via-rose-600 to-pink-700 text-white shadow-[0_0_55px_rgba(244,63,94,0.25)] transition disabled:cursor-not-allowed disabled:opacity-60 sm:h-48 sm:w-48"
            >
              {sosLoading ? (
                <FiRefreshCw className="animate-spin text-4xl" />
              ) : (
                <>
                  <FiShield className="mb-2 text-4xl" />
                  <span className="text-3xl font-black tracking-widest">
                    SOS
                  </span>
                  <span className="mt-2 text-xs font-semibold">
                    EMERGENCY
                  </span>
                </>
              )}
            </motion.button>

            <VoiceSosButton
              onSos={triggerSOS}
              disabled={sosLoading}
              locationReady={Boolean(location)}
            />

            <h2 className="mt-6 text-xl font-bold">
              {sosLoading
                ? 'Sending Emergency Alert...'
                : 'Need Immediate Help?'}
            </h2>

            <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">
              Trigger an SOS alert to record an emergency and
              share your available location with the system.
            </p>

            {!location && (
              <p className="mt-4 text-xs text-amber-300">
                Location permission is required to trigger SOS.
              </p>
            )}

            <p className="mt-4 text-xs text-slate-500">
              Use this button only during an emergency.
            </p>
          </div>

          {/* Location */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
              <div className="flex items-start gap-4">
                <div className={`rounded-xl p-3 ${
                  location
                    ? 'bg-emerald-400/10 text-emerald-300'
                    : 'bg-amber-400/10 text-amber-300'
                }`}>
                  {location ? (
                    <FiMapPin className="text-2xl" />
                  ) : (
                    <FiNavigation className="text-2xl" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="font-bold">Current Location</h3>

                  <p className={`mt-1 text-sm ${
                    location
                      ? 'text-emerald-300'
                      : 'text-amber-300'
                  }`}>
                    {location
                      ? 'Location available'
                      : 'Waiting for location'}
                  </p>

                  {location && (
                    <div className="mt-3 space-y-1 text-xs text-slate-400">
                      <p>Latitude: {location.lat.toFixed(6)}</p>
                      <p>Longitude: {location.lng.toFixed(6)}</p>
                    </div>
                  )}

                  {!location && (
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      Allow location access in your browser.
                    </p>
                  )}
                </div>
              </div>

              {location && (
                <a
                  href={`https://www.google.com/maps?q=${location.lat},${location.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-400/20"
                >
                  <FiMapPin />
                  View Location on Map
                  <FiExternalLink />
                </a>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-pink-400/10 p-3 text-pink-300">
                  <FiPhone className="text-xl" />
                </div>

                <div>
                  <p className="text-sm text-slate-400">
                    Emergency Contacts
                  </p>
                  <p className="mt-1 text-2xl font-bold">
                    {savedContactsCount}
                    <span className="ml-2 text-sm font-normal text-slate-500">
                      configured
                    </span>
                  </p>
                </div>
              </div>

              <p className="mt-3 text-xs leading-5 text-slate-500">
                Keep trusted contacts updated so their details are
                ready when you need help.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Emergency Contacts */}
      <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-5 sm:p-7">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-pink-500/10 p-3 text-pink-300">
              <FiPhone className="text-xl" />
            </div>

            <div>
              <h2 className="text-xl font-bold">
                Emergency Contacts
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Add trusted people who can support you in an emergency.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={addContact}
            disabled={
              contactsLoading ||
              contacts.length >= 10 ||
              savingContacts
            }
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-pink-400/20 bg-pink-400/10 px-4 py-2 text-sm font-semibold text-pink-300 transition hover:bg-pink-400/20 disabled:opacity-50"
          >
            <FiPlus />
            Add Contact
          </button>
        </div>

        {contactsLoading ? (
          <div className="flex justify-center py-8">
            <Loader />
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {contacts.map((contact, index) => (
                <div
                  key={index}
                  className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 sm:p-5"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Trusted Contact {index + 1}
                    </span>

                    <button
                      type="button"
                      onClick={() => deleteContact(index)}
                      disabled={savingContacts}
                      aria-label={`Remove contact ${index + 1}`}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-400/10 hover:text-red-300 disabled:opacity-50"
                    >
                      <FiTrash2 />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-slate-400">
                        Full Name
                      </span>
                      <input
                        value={contact.name}
                        onChange={(event) =>
                          updateContact(
                            index,
                            'name',
                            event.target.value
                          )
                        }
                        placeholder="Enter full name"
                        className={inputClass}
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-400">
                        <FiPhone />
                        Phone Number
                      </span>
                      <input
                        type="tel"
                        value={contact.phone}
                        onChange={(event) =>
                          updateContact(
                            index,
                            'phone',
                            event.target.value
                          )
                        }
                        placeholder="Enter phone number"
                        className={inputClass}
                      />
                    </label>

                    <label className="block md:col-span-2">
                      <span className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-400">
                        <FiMail />
                        Email Address (Optional)
                      </span>
                      <input
                        type="email"
                        value={contact.email || ''}
                        onChange={(event) =>
                          updateContact(
                            index,
                            'email',
                            event.target.value
                          )
                        }
                        placeholder="Enter email address"
                        className={inputClass}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-col justify-between gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center">
              <p className="text-xs leading-5 text-slate-500">
                Maximum 10 contacts. Name and phone are required;
                email is optional.
              </p>

              <button
                type="button"
                onClick={saveContacts}
                disabled={savingContacts}
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 px-6 py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingContacts ? (
                  <FiRefreshCw className="animate-spin" />
                ) : (
                  <FiSave />
                )}

                {savingContacts
                  ? 'Saving Contacts...'
                  : 'Save Contacts'}
              </button>
            </div>
          </>
        )}
      </section>

      {/* SOS History */}
      <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/60">
        <div className="flex flex-col justify-between gap-3 border-b border-white/10 p-5 sm:flex-row sm:items-center sm:p-7">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-cyan-400/10 p-3 text-cyan-300">
              <FiClock className="text-xl" />
            </div>

            <div>
              <h2 className="text-xl font-bold">SOS History</h2>
              <p className="mt-1 text-sm text-slate-400">
                Review your previous emergency alerts.
              </p>
            </div>
          </div>

          <span className="w-fit rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300">
            {alerts.length} total
          </span>
        </div>

        {alerts.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800 text-slate-400">
              <FiShield className="text-3xl" />
            </div>

            <h3 className="mt-4 font-bold">No SOS alerts yet</h3>
            <p className="mt-2 text-sm text-slate-500">
              Your triggered emergency alerts will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {alerts.map((alert) => {
              const coordinates = alert.location?.coordinates

              const hasCoordinates =
                Array.isArray(coordinates) &&
                coordinates.length === 2

              const latitude = hasCoordinates
                ? coordinates[1]
                : null

              const longitude = hasCoordinates
                ? coordinates[0]
                : null

              return (
                <div
                  key={alert._id}
                  className="flex flex-col justify-between gap-4 p-5 transition hover:bg-white/[0.02] sm:flex-row sm:items-center sm:p-6"
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-1 rounded-xl p-3 ${
                      alert.status === 'resolved'
                        ? 'bg-emerald-400/10 text-emerald-300'
                        : 'bg-red-400/10 text-red-300'
                    }`}>
                      {alert.status === 'resolved' ? (
                        <FiCheckCircle className="text-xl" />
                      ) : (
                        <FiAlertTriangle className="text-xl" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <h3 className="font-bold">
                        SOS Emergency Alert
                      </h3>

                      <p className="mt-1 text-xs text-slate-400">
                        {alert.createdAt
                          ? new Date(
                              alert.createdAt
                            ).toLocaleString()
                          : 'Time unavailable'}
                      </p>

                      {hasCoordinates && (
                        <a
                          href={`https://www.google.com/maps?q=${latitude},${longitude}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200"
                        >
                          <FiMapPin />
                          View alert location
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                    <StatusBadge status={alert.status} />

                    {alert.status === 'active' && (
                      <button
                        type="button"
                        onClick={() => resolveAlert(alert._id)}
                        disabled={resolvingId !== null}
                        className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-xs font-bold text-emerald-300 transition hover:bg-emerald-400/20 disabled:opacity-50"
                      >
                        {resolvingId === alert._id ? (
                          <FiRefreshCw className="animate-spin" />
                        ) : (
                          <FiCheckCircle />
                        )}

                        {resolvingId === alert._id
                          ? 'Resolving...'
                          : 'Resolve'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Safety Notice */}
      <div className="flex items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
        <FiAlertTriangle className="mt-0.5 shrink-0 text-amber-300" />

        <p className="text-xs leading-5 text-slate-400">
          <span className="font-semibold text-amber-200">
            Important:
          </span>{' '}
          SOS functionality depends on location permissions, network
          availability and backend services. For immediate danger,
          contact local emergency services as well.
        </p>
      </div>
    </div>
  )
}

function SummaryCard({ icon, label, value, color }) {
  const colors = {
    pink: 'border-pink-400/20 bg-pink-400/10 text-pink-300',
    amber: 'border-amber-400/20 bg-amber-400/10 text-amber-300',
    emerald: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 transition hover:border-white/20">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-400">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight">
            {value}
          </p>
        </div>

        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl border text-xl ${
            colors[color] || colors.pink
          }`}
        >
          {icon}
        </div>
      </div>
    </div>
  )
}