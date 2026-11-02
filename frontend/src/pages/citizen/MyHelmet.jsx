import HelmetDashboard from '../../components/HelmetDashboard'

export default function MyHelmet() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-black text-white">My Helmet</h1>
        <p className="text-slate-400 text-sm mt-1">
          Live status, location and crash alerts from your smart helmet.
        </p>
      </div>
      <HelmetDashboard />
    </div>
  )
}
