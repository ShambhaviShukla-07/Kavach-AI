require('dotenv').config()

const mongoose = require('mongoose')
const User = require('../models/User')
const { configuredAdminEmails } = require('../utils/adminAccess')

const accounts = [
  {
    email: process.env.ADMIN_EMAIL_1?.trim().toLowerCase(),
    password: process.env.ADMIN_PASSWORD_1,
    name: 'KavachAI Admin 1'
  },
  {
    email: process.env.ADMIN_EMAIL_2?.trim().toLowerCase(),
    password: process.env.ADMIN_PASSWORD_2,
    name: 'KavachAI Admin 2'
  }
]

const setupAdmins = async () => {
  const emails = configuredAdminEmails()
  const passwords = accounts.map((account) => account.password)

  if (
    emails.length !== 2 ||
    accounts.some((account) => !account.password || account.password.length < 12) ||
    passwords[0] === passwords[1]
  ) {
    throw new Error(
      'Configure two distinct admin emails and two different passwords of at least 12 characters.'
    )
  }

  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI must be configured.')
  }

  await mongoose.connect(process.env.MONGO_URI)

  for (const account of accounts) {
    let user = await User.findOne({ email: account.email }).select('+password')

    if (!user) {
      user = new User({ email: account.email })
    }

    user.name = account.name
    user.password = account.password
    user.role = 'admin'
    user.phone = ''
    user.isActive = true
    await user.save()

    console.log(`Configured admin account: ${account.email}`)
  }

  await mongoose.disconnect()
}

setupAdmins().catch(async (error) => {
  console.error(error.message)
  await mongoose.disconnect()
  process.exitCode = 1
})