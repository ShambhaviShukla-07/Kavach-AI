import axios from 'axios'

const api = axios.create({
baseURL: '/api',
withCredentials: true,
headers: {
'Content-Type': 'application/json'
}
})

// Attach JWT token to API requests
api.interceptors.request.use(
(config) => {
const token = localStorage.getItem('kavach_token')

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
  localStorage.removeItem('kavach_token')
  localStorage.removeItem('kavach_user')

  if (window.location.pathname !== '/login') {
    window.location.href = '/login'
  }
}

return Promise.reject(error)

}
)

export default api