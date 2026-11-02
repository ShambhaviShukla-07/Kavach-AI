const SEVERITY_COLORS = {
  low:      'text-green-400 bg-green-400/10 border border-green-400/20',
  medium:   'text-yellow-400 bg-yellow-400/10 border border-yellow-400/20',
  high:     'text-orange-400 bg-orange-400/10 border border-orange-400/20',
  critical: 'text-red-400 bg-red-400/10 border border-red-400/20',
}

const STATUS_COLORS = {
  pending:    'text-yellow-400 bg-yellow-400/10 border border-yellow-400/20',
  acknowledged: 'text-cyan-400 bg-cyan-400/10 border border-cyan-400/20',
  dispatched: 'text-blue-400 bg-blue-400/10 border border-blue-400/20',
  en_route:   'text-cyan-400 bg-cyan-400/10 border border-cyan-400/20',
  arrived:    'text-purple-400 bg-purple-400/10 border border-purple-400/20',
  resolved:   'text-green-400 bg-green-400/10 border border-green-400/20',
  online:     'text-green-400 bg-green-400/10 border border-green-400/20',
  offline:    'text-red-400 bg-red-400/10 border border-red-400/20',
  cancelled:  'text-red-400 bg-red-400/10 border border-red-400/20',
  active:     'text-red-400 bg-red-400/10 border border-red-400/20',
  false_alarm:'text-slate-400 bg-slate-400/10 border border-slate-400/20',
}

export function SeverityBadge({ severity }) {
  return (
    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize ${SEVERITY_COLORS[severity] || 'text-slate-400 bg-slate-400/10'}`}>
      {severity}
    </span>
  )
}

export function StatusBadge({ status }) {
  return (
    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize ${STATUS_COLORS[status] || 'text-slate-400 bg-slate-400/10'}`}>
      {status?.replace(/_/g, ' ')}
    </span>
  )
}
