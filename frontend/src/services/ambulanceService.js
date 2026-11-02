import api from './api'

export const ambulanceService = {
  getAll: () => api.get('/ambulance'),
  getAvailable: () => api.get('/ambulance/available'),
  getDrivers: () => api.get('/ambulance/drivers'),
  create: (data) => api.post('/ambulance', data),
  update: (id, data) => api.put(`/ambulance/${id}`, data),
  updateLocation: (id, coordinates) => api.put(`/ambulance/${id}/location`, { coordinates })
}
