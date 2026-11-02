require('dotenv').config()
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const User = require('./models/User')
const Ambulance = require('./models/Ambulance')
const Hospital = require('./models/Hospital')

const seed = async () => {
  await mongoose.connect(process.env.MONGO_URI)
  console.log('Connected to MongoDB')

  // Existing data is kept; only missing demo records are created.
  const ensure = async (Model, key, data) => {
    const existing = await Model.findOne({ [key]: data[key] })
    return existing || Model.create(data)
  }

  const demoUsers = [
    { name: 'Priya Citizen', email: 'citizen@demo.com', password: 'demo123', phone: '+919876543210', role: 'citizen' },
    { name: 'Raj Dispatcher', email: 'dispatcher@demo.com', password: 'demo123', phone: '+919876543211', role: 'dispatcher' },
    { name: 'Amit Driver', email: 'driver@demo.com', password: 'demo123', phone: '+919876543212', role: 'driver' },
    { name: 'Dr. Sharma', email: 'hospital@demo.com', password: 'demo123', phone: '+919876543213', role: 'hospital_admin' },
    { name: 'Rahul Verma', email: 'driver2@demo.com', password: 'demo123', phone: '+919876543221', role: 'driver' },
    { name: 'Suresh Yadav', email: 'driver3@demo.com', password: 'demo123', phone: '+919876543222', role: 'driver' },
    { name: 'Vikram Singh', email: 'driver4@demo.com', password: 'demo123', phone: '+919876543223', role: 'driver' },
    { name: 'Manoj Kumar', email: 'driver5@demo.com', password: 'demo123', phone: '+919876543224', role: 'driver' }
  ]

  const users = []
  for (const demoUser of demoUsers) {
    const user = await ensure(User, 'email', demoUser)

    // Bring older demo accounts to the international phone format.
    if (user.phone !== demoUser.phone) {
      user.phone = demoUser.phone
      await user.save()
    }

    users.push(user)
  }
  console.log('Demo users ready')

  const drivers = demoUsers
    .filter(u => u.role === 'driver')
    .map(u => users.find(user => user.email === u.email))

  const demoAmbulances = [
    { vehicleNumber: 'MH-01-KA-001', driver: drivers[0]._id, status: 'available', fuelLevel: 95, healthScore: 98 },
    { vehicleNumber: 'MH-01-KA-002', driver: drivers[1]._id, status: 'available', fuelLevel: 80, healthScore: 90 },
    { vehicleNumber: 'MH-01-KA-003', driver: drivers[2]._id, status: 'available', fuelLevel: 70, healthScore: 85 },
    { vehicleNumber: 'MH-01-KA-004', driver: drivers[3]._id, status: 'maintenance', fuelLevel: 30, healthScore: 45 }
  ]
  for (const ambulance of demoAmbulances) {
    const existing = await ensure(Ambulance, 'vehicleNumber', ambulance)
    if (!existing.driver) {
      existing.driver = ambulance.driver
      await existing.save()
    }
  }
  console.log('Ambulances ready')

  const hospitalAdmin = users.find(u => u.role === 'hospital_admin')
  const demoHospitals = [
    { name: 'City General Hospital', admin: hospitalAdmin._id, address: 'MG Road, Mumbai', phone: '022-12345678', location: { type: 'Point', coordinates: [72.8777, 19.0760] }, totalBeds: 50, availableBeds: 12, specializations: ['Trauma', 'Cardiology'] },
    { name: 'Apollo Emergency Center', address: 'Bandra West, Mumbai', phone: '022-87654321', location: { type: 'Point', coordinates: [72.8347, 19.0596] }, totalBeds: 30, availableBeds: 4, specializations: ['Neurology', 'Orthopedics'] },
    { name: 'Metro Trauma Hospital', address: 'Andheri East, Mumbai', phone: '022-11223344', location: { type: 'Point', coordinates: [72.8697, 19.1136] }, totalBeds: 40, availableBeds: 0, specializations: ['Burns', 'Trauma'] }
  ]
  for (const hospital of demoHospitals) {
    await ensure(Hospital, 'name', hospital)
  }
  console.log('Hospitals ready')

  console.log('\n✅ Seed complete!')
  console.log('Demo accounts:')
  console.log('  Citizen:    citizen@demo.com    / demo123')
  console.log('  Dispatcher: dispatcher@demo.com / demo123')
  console.log('  Driver:     driver@demo.com     / demo123  (driver2..driver5@demo.com / demo123 too)')
  console.log('  Hospital:   hospital@demo.com   / demo123')

  process.exit(0)
}

seed().catch(err => { console.error(err); process.exit(1) })
