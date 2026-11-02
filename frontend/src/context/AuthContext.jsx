import { createContext, useContext, useState, useEffect } from 'react'
import { authService } from '../services/authService'
import toast from 'react-hot-toast'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('kavach_user')) } catch { return null }
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = sessionStorage.getItem('kavach_token')
    if (token) {
      authService.getMe()
        .then(res => setUser(res.data.data))
        .catch(() => { sessionStorage.removeItem('kavach_token'); sessionStorage.removeItem('kavach_user') })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (email, password) => {
    const res = await authService.login({ email, password })
    const { user, token } = res.data.data
    sessionStorage.setItem('kavach_token', token)
    sessionStorage.setItem('kavach_user', JSON.stringify(user))
    setUser(user)
    toast.success(`Welcome back, ${user.name}!`)
    return user
  }

  const register = async (data) => {
    const res = await authService.register(data)
    const { user, token } = res.data.data
    sessionStorage.setItem('kavach_token', token)
    sessionStorage.setItem('kavach_user', JSON.stringify(user))
    setUser(user)
    toast.success('Account created successfully!')
    return user
  }

  const logout = () => {
    sessionStorage.removeItem('kavach_token')
    sessionStorage.removeItem('kavach_user')
    setUser(null)
    toast.success('Logged out')
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
