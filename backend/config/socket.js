let io

const initSocket = (server) => {
const { Server } = require('socket.io')
const { corsOrigin } = require('./origins')

io = new Server(server, {
cors: {
origin: corsOrigin,
methods: ['GET', 'POST'],
credentials: true
}
})

io.on('connection', (socket) => {
console.log(`🔌 Socket connected: ${socket.id}`)


socket.on('join_room', (room) => {
  if (typeof room === 'string' && room.trim()) {
    socket.join(room)
  }
})

socket.on('join_user_room', (userId) => {
  if (typeof userId === 'string' && userId.trim()) {
    socket.join(`user_${userId}`)
  }
})

socket.on('location_update', (data) => {
  if (data?.room) {
    io.to(data.room).emit('location_updated', data)
  }
})

socket.on('sos_alert', (data) => {
  io.emit('new_sos', data)
})

socket.on('emergency_update', (data) => {
  io.emit('emergency_updated', data)
})

socket.on('disconnect', () => {
  console.log(`🔌 Socket disconnected: ${socket.id}`)
})


})

return io
}

const getIO = () => {
if (!io) throw new Error('Socket not initialized')
return io
}

module.exports = { initSocket, getIO }
