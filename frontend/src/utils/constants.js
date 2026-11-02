export const ROLES = {
  CITIZEN: 'citizen',
  DISPATCHER: 'dispatcher',
  DRIVER: 'driver',
  HOSPITAL: 'hospital_admin',
  ADMIN: 'admin'
}

export const EMERGENCY_TYPES = [
  { value: 'medical', label: 'Medical Emergency' },
  { value: 'accident', label: 'Road Accident' },
  { value: 'fire', label: 'Fire Emergency' },
  { value: 'women_sos', label: 'Women SOS' },
  { value: 'other', label: 'Other' }
]

export const SEVERITY_COLORS = {
  low: 'text-green-400 bg-green-400/10',
  medium: 'text-yellow-400 bg-yellow-400/10',
  high: 'text-orange-400 bg-orange-400/10',
  critical: 'text-red-400 bg-red-400/10'
}

export const STATUS_COLORS = {
  pending: 'text-yellow-400 bg-yellow-400/10',
  dispatched: 'text-blue-400 bg-blue-400/10',
  en_route: 'text-cyan-400 bg-cyan-400/10',
  arrived: 'text-purple-400 bg-purple-400/10',
  resolved: 'text-green-400 bg-green-400/10',
  cancelled: 'text-red-400 bg-red-400/10'
}

export const ROLE_DASHBOARDS = {
  citizen: '/citizen/dashboard',
  dispatcher: '/dispatcher/dashboard',
  driver: '/driver/dashboard',
  hospital_admin: '/hospital/dashboard',
  admin: '/admin/helmet'
}
