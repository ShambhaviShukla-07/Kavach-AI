import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ROLE_DASHBOARDS } from '../utils/constants'

export default function RoleRoute({ roles, children }) {
  const { user } = useAuth()
  if (user?.role === 'admin') return children
  if (!roles.includes(user?.role)) {
    return <Navigate to={ROLE_DASHBOARDS[user?.role] || '/'} replace />
  }
  return children
}
