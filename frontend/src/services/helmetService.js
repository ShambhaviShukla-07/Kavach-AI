import api from './api'

export const helmetService = {
  getDeviceStatus: () => api.get('/helmet/device')
}
