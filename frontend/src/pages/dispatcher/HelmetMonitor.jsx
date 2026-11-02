import HelmetDashboard from '../../components/HelmetDashboard'

export default function HelmetMonitor() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Helmet SOS Monitor</h1>
        <p className="text-slate-400 text-sm mt-1">
          H1 live status, SOS alerts and admin response history.
        </p>
      </div>

      <HelmetDashboard />
    </div>
  )
}

