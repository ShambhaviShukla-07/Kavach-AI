
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const { isValidPhone } = require('../utils/phone')

// Emergency contact schema for the Women Safety module
const emergencyContactSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },

  phone: {
    type: String,
    required: true,
    trim: true
  },

  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: '',
    validate: {
      validator: function (value) {
        if (!value) return true
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      },
      message: 'Please enter a valid emergency contact email'
    }
  }
}, { _id: true })

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },

  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },

  password: {
    type: String,
    required: true,
    minlength: 6
  },

  phone: {
    type: String,
    required: function () {
      return this.role !== 'admin'
    },
    validate: {
      validator: function (value) {
        if (!value && this.role === 'admin') return true
        // Older accounts keep their stored number until it is changed.
        if (typeof this.isModified === 'function' && !this.isModified('phone')) return true
        return isValidPhone(value)
      },
      message: 'Please enter a valid phone number with country code'
    }
  },

  role: {
    type: String,
    enum: ['citizen', 'dispatcher', 'driver', 'hospital_admin', 'admin'],
    default: 'citizen'
  },

  avatar: {
    type: String,
    default: ''
  },

  isActive: {
    type: Boolean,
    default: true
  },

  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },

    coordinates: {
      type: [Number],
      default: [0, 0]
    }
  },

    // Saved emergency contacts for the Women Safety module
  emergencyContacts: {
    type: [emergencyContactSchema],
    default: [],
    validate: {
      validator: contacts => contacts.length <= 10,
      message: 'You can save a maximum of 10 emergency contacts'
    }
  },

  // Password reset fields
  resetPasswordToken: {
    type: String,
    default: undefined
  },

  resetPasswordExpires: {
    type: Date,
    default: undefined
  }

}, { timestamps: true })

userSchema.index({ location: '2dsphere' })

// Hash password only when it has been changed
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next()

  try {
    this.password = await bcrypt.hash(this.password, 12)
    next()
  } catch (error) {
    next(error)
  }
})

userSchema.methods.matchPassword = async function (entered) {
  return await bcrypt.compare(entered, this.password)
}

// Never expose the password in JSON responses
userSchema.methods.toJSON = function () {
  const obj = this.toObject()
  delete obj.password
  return obj
}

module.exports = mongoose.model('User', userSchema)

