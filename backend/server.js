require('dotenv').config({ path: require('path').resolve(__dirname, '.env') })
console.log('Mongo URI loaded:', !!process.env.MONGO_URI)
const express = require('express')
const http = require('http')
const cors = require('cors')
const morgan = require('morgan')
const connectDB = require('./config/db')
const { initSocket } = require('./config/socket')
const errorHandler = require('./middlewares/errorMiddleware')

// Connect DB
connectDB()

const app = express()
const server = http.createServer(app)

// Init Socket.io
initSocket(server)

// Middleware
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
if (process.env.NODE_ENV === 'development') app.use(morgan('dev'))

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'OK', message: 'KavachAI API running' }))

// Routes
app.use('/api/auth', require('./routes/authRoutes'))
app.use('/api/emergency', require('./routes/emergencyRoutes'))
app.use('/api/ambulance', require('./routes/ambulanceRoutes'))
app.use('/api/hospital', require('./routes/hospitalRoutes'))
app.use('/api/women-safety', require('./routes/womenSafetyRoutes'))
app.use('/api/notifications', require('./routes/notificationRoutes'))
app.use('/api/helmet', require('./routes/helmetRoutes'))
// 404
app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }))

// Error handler
app.use(errorHandler)

const PORT = process.env.PORT || 5000
server.listen(PORT, () => {
  console.log(`🚀 KavachAI Server running on http://localhost:${PORT}`)
  console.log(`📡 Socket.io ready`)
  console.log(`🌍 Environment: ${process.env.NODE_ENV}`)
})
