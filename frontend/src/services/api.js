import axios from 'axios'

// Set VITE_API_URL (e.g. https://api.example.com) when the backend is hosted separately.
const API_ORIGIN = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

const api = axios.create({
baseURL: `${API_ORIGIN}/api`,
withCredentials: true,
headers: {
'Content-Type': 'application/json'
}
})

// Attach JWT token to API requests
api.interceptors.request.use(
(config) => {
const token = sessionStorage.getItem('kavach_token')

if (token) {
  config.headers.Authorization = `Bearer ${token}`
}

return config

},
(error) => Promise.reject(error)
)

// Handle authentication errors
api.interceptors.response.use(
(response) => response,
(error) => {
const status = error.response?.status
const requestUrl = error.config?.url || ''

// Redirect only if an authenticated request fails
// Avoid redirect loops on login and registration requests
const isAuthRequest =
  requestUrl.includes('/login') ||
  requestUrl.includes('/register')

if (status === 401 && !isAuthRequest) {
  sessionStorage.removeItem('kavach_token')
  sessionStorage.removeItem('kavach_user')

  if (window.location.pathname !== '/login') {
    window.location.href = '/login'
  }
}

return Promise.reject(error)

}
)

export default api