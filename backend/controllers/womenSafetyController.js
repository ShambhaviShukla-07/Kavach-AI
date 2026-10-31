const SOSAlert = require('../models/SOSAlert');
const Emergency = require('../models/Emergency');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

// ==========================================
// TEXTBEE SMS HELPER
// ==========================================

const sendTextBeeSMS = async (phone, message) => {
  const apiKey = process.env.TEXTBEE_API_KEY;

  if (!apiKey) {
    console.error('TextBee API key is missing');
    return {
      success: false,
      message: 'TextBee API key is missing',
    };
  }

  // Normalize Indian phone numbers
  let recipient = String(phone || '').replace(/[\s()-]/g, '');

  if (/^\d{10}$/.test(recipient)) {
    recipient = `+91${recipient}`;
  } else if (/^91\d{10}$/.test(recipient)) {
    recipient = `+${recipient}`;
  }

  // Validate international phone number
  if (!/^\+\d{8,15}$/.test(recipient)) {
    console.error('Invalid TextBee recipient number');
    return {
      success: false,
      message: 'Invalid recipient phone number',
    };
  }

  try {
    const response = await fetch(
      'https://api.textbee.dev/api/v1/gateway/send-sms',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey.trim(),
        },
        body: JSON.stringify({
          recipients: [recipient],
          message: String(message || ''),
        }),
      }
    );

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error('TextBee SMS error:', response.status, result);

      return {
        success: false,
        message:
          result.message ||
          result.error ||
          `TextBee request failed with status ${response.status}`,
      };
    }

    console.log(`TextBee accepted SMS request for ${recipient}`);

    return {
      success: true,
      smsBatchId: result.smsBatchId || result.id || null,
      message: 'SMS request accepted by TextBee',
    };
  } catch (error) {
    console.error('TextBee request failed:', error.message);

    return {
      success: false,
      message: 'Unable to connect to TextBee',
    };
  }
};


// ==========================================
// VALIDATE EMERGENCY CONTACTS
// ==========================================
const validateContacts = (contacts) => {
  if (!Array.isArray(contacts)) {
    throw new ApiError(
      400,
      'Emergency contacts must be an array'
    );
  }

  if (contacts.length > 10) {
    throw new ApiError(
      400,
      'Maximum 10 emergency contacts are allowed'
    );
  }

  return contacts.map((contact) => {
    if (
      !contact ||
      typeof contact.name !== 'string' ||
      typeof contact.phone !== 'string' ||
      !contact.name.trim() ||
      !contact.phone.trim()
    ) {
      throw new ApiError(
        400,
        'Every contact must have a name and phone number'
      );
    }

    const email =
      typeof contact.email === 'string'
        ? contact.email.trim().toLowerCase()
        : '';

    if (
      email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      throw new ApiError(
        400,
        `Invalid email address for ${contact.name}`
      );
    }

    return {
      name: contact.name.trim(),
      phone: contact.phone.trim(),
      email
    };
  });
};

// ==========================================
// SAVE EMERGENCY CONTACTS
// ==========================================
const saveEmergencyContacts = asyncHandler(
  async (req, res) => {
    const contacts = validateContacts(
      req.body.emergencyContacts
    );

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          emergencyContacts: contacts
        }
      },
      {
        new: true,
        runValidators: true
      }
    ).select('emergencyContacts');

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        user.emergencyContacts,
        'Emergency contacts saved successfully'
      )
    );
  }
);

// ==========================================
// GET EMERGENCY CONTACTS
// ==========================================
const getEmergencyContacts = asyncHandler(
  async (req, res) => {
    const user = await User.findById(
      req.user._id
    ).select('emergencyContacts');

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        user.emergencyContacts || [],
        'Emergency contacts fetched successfully'
      )
    );
  }
);

// ==========================================
// EMAILJS SOS EMAIL HELPER
// ==========================================
const sendSOSEmail = async ({
  contact,
  userName,
  location,
  alertTime,
  alertId
}) => {
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templateId = process.env.EMAILJS_TEMPLATE_ID;
  const publicKey = process.env.EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;

  // The private key is only required when EmailJS strict mode is enabled.
  if (!serviceId || !templateId || !publicKey) {
    console.error(
      'EmailJS configuration incomplete. Check backend .env.'
    );

    return {
      status: 'not_configured'
    };
  }

  if (!contact.email) {
    return {
      status: 'skipped_no_email'
    };
  }

  try {
    const response = await fetch(
      'https://api.emailjs.com/api/v1.0/email/send',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          service_id: serviceId,
          template_id: templateId,
          user_id: publicKey,

          // Required only when EmailJS strict mode is enabled.
          ...(privateKey ? { accessToken: privateKey } : {}),

          template_params: {
            to_email: contact.email,
            to_name: contact.name,
            from_name: userName || 'KavachAI user',
            user_name: userName || 'KavachAI user',
            subject: `KavachAI SOS alert${
              alertId ? ` ${alertId}` : ''
            }`,
            message:
              'An emergency SOS alert has been triggered. Please contact the person immediately.',
            location: location.address,
            maps_url: location.mapsUrl,
            map_url: location.mapsUrl,
            alert_id: alertId || '',
            alert_time: alertTime
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      console.error(
        `EmailJS failed for ${contact.name}:`,
        response.status,
        errorText
      );

      return {
        status: 'failed'
      };
    }

    console.log(
      `EmailJS accepted email request for ${contact.name}`
    );

    return {
      status: 'sent'
    };
  } catch (error) {
    console.error(
      `SOS email failed for ${contact.name}:`,
      error.message
    );

    return {
      status: 'failed'
    };
  }
};

// ==========================================
// TRIGGER WOMEN SAFETY SOS
// ==========================================
const triggerSOS = asyncHandler(async (req, res) => {
  const {
    coordinates,
    address,
    mapsUrl,
    locationAccuracy,
    locationTimestamp,
    emergencyContacts
  } = req.body;

  // Validate GPS coordinates.
  if (
    !Array.isArray(coordinates) ||
    coordinates.length !== 2 ||
    !coordinates.every(
      value =>
        typeof value === 'number' &&
        Number.isFinite(value)
    )
  ) {
    throw new ApiError(
      400,
      'Valid current GPS coordinates are required'
    );
  }

  const [longitude, latitude] = coordinates;

  if (
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    throw new ApiError(
      400,
      'GPS coordinates are out of range'
    );
  }

  // Use contacts from the request if supplied.
  // Otherwise, load saved contacts from the database.
  let safeContacts;

  if (Array.isArray(emergencyContacts)) {
    safeContacts = validateContacts(emergencyContacts);
  } else {
    const savedUser = await User.findById(
      req.user._id
    ).select('emergencyContacts');

    safeContacts = savedUser?.emergencyContacts || [];
  }

  const currentUser = await User.findById(
    req.user._id
  ).select('name email');

  if (!currentUser) {
    throw new ApiError(404, 'User not found');
  }

  const validMapsUrl =
    typeof mapsUrl === 'string' && mapsUrl.trim()
      ? mapsUrl.trim()
      : `https://www.google.com/maps?q=${latitude},${longitude}`;

  const accuracy = Number.isFinite(locationAccuracy)
    ? locationAccuracy
    : null;

  const timestamp = locationTimestamp
    ? new Date(locationTimestamp)
    : new Date();

  if (Number.isNaN(timestamp.getTime())) {
    throw new ApiError(
      400,
      'Invalid location timestamp'
    );
  }

  const safeAddress =
    typeof address === 'string' && address.trim()
      ? address.trim()
      : `${latitude}, ${longitude}`;

  const location = {
    type: 'Point',
    coordinates: [longitude, latitude],
    address: safeAddress,
    mapsUrl: validMapsUrl,
    accuracy,
    locationTimestamp: timestamp
  };

  // Save SOS first, even if notifications fail.
  const sos = await SOSAlert.create({
    user: req.user._id,
    location,
    emergencyContacts: safeContacts
  });

  // Create linked emergency record.
  let emergency;

  try {
    emergency = await Emergency.create({
      citizen: req.user._id,
      type: 'women_sos',
      severity: 'critical',
      description: 'Women Safety SOS alert triggered',
      location
    });

    sos.linkedEmergency = emergency._id;
    await sos.save();
  } catch (error) {
    console.error(
      'SOS emergency creation failed:',
      error.message
    );

    throw error;
  }

  const alertTime = timestamp.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata'
  });

 // ========================================
// SEND EMAIL NOTIFICATIONS
// ========================================

console.log('\n========== EMAIL DEBUG START ==========');

console.log('Total emergency contacts:', safeContacts.length);

const emailContacts = safeContacts.filter(
  contact => contact.email && contact.email.trim()
);

console.log('Contacts with email:', emailContacts.length);

const emailConfigured = Boolean(
  process.env.EMAILJS_SERVICE_ID &&
  process.env.EMAILJS_TEMPLATE_ID &&
  process.env.EMAILJS_PUBLIC_KEY
);

console.log('EmailJS Service ID configured:', !!process.env.EMAILJS_SERVICE_ID);
console.log('EmailJS Template ID configured:', !!process.env.EMAILJS_TEMPLATE_ID);
console.log('EmailJS Public Key configured:', !!process.env.EMAILJS_PUBLIC_KEY);

let emailStatus = 'not_configured';
let emailSent = 0;
let emailFailed = 0;

if (!emailConfigured) {
  emailStatus = 'not_configured';
  console.error('EMAIL ERROR: EmailJS configuration is incomplete.');
}
else if (emailContacts.length === 0) {
  emailStatus = 'no_email_contacts';
  console.error('EMAIL ERROR: No emergency contact has an email address.');
}
else {
  console.log('Starting EmailJS notification process...');

  const emailResults = await Promise.all(
    emailContacts.map(contact =>
      sendSOSEmail({
        contact,
        userName: currentUser.name,
        location: {
          address: safeAddress,
          mapsUrl: validMapsUrl
        },
        alertTime,
        alertId: sos._id.toString()
      })
    )
  );

  emailSent = emailResults.filter(
    result => result.status === 'sent'
  ).length;

  emailFailed = emailResults.filter(
    result => result.status === 'failed' ||
              result.status === 'not_configured'
  ).length;

  if (emailSent === emailContacts.length) {
    emailStatus = 'sent';
  }
  else if (emailSent > 0) {
    emailStatus = 'partially_sent';
  }
  else {
    emailStatus = 'failed';
  }

  console.log('Email results:', emailResults);
}

console.log('Final Email Status:', emailStatus);
console.log('Emails Sent:', emailSent);
console.log('Emails Failed:', emailFailed);

console.log('========== EMAIL DEBUG END ==========\n');

  // ========================================
  // SEND SMS NOTIFICATIONS THROUGH TEXTBEE
  // ========================================
  const smsContacts = safeContacts.filter(
    contact => contact.phone
  );

  let smsStatus = 'not_configured';
  let smsSent = 0;
  let smsFailed = 0;

  if (process.env.TEXTBEE_API_KEY) {
    if (smsContacts.length === 0) {
      smsStatus = 'no_contacts';
    } else {
      const smsMessage =
        `KAVACHAI SOS ALERT! ${currentUser.name || 'A user'} ` +
        'may need emergency assistance. ' +
        `Location: ${validMapsUrl} | ` +
        `Time: ${alertTime}. ` +
        'Please contact them immediately.';

      const smsResults = await Promise.all(
        smsContacts.map(contact =>
          sendTextBeeSMS(
            contact.phone,
            smsMessage
          )
        )
      );

      smsSent = smsResults.filter(
        result => result.success
      ).length;

      smsFailed = smsResults.length - smsSent;

      if (smsSent === smsContacts.length) {
        smsStatus = 'sent';
      } else if (smsSent > 0) {
        smsStatus = 'partially_sent';
      } else {
        smsStatus = 'failed';
      }
    }
  } else {
    console.error('TEXTBEE_API_KEY is missing in backend .env');
    smsStatus = 'not_configured';
  }

  // ========================================
  // SOCKET.IO NOTIFICATION
  // ========================================
  try {
    const { getIO } = require('../config/socket');
    const io = getIO();

    if (io) {
      io.emit('new_sos', {
        sos,
        emergency,
        location: {
          latitude,
          longitude,
          mapsUrl: validMapsUrl,
          accuracy,
          timestamp
        }
      });
    }
  } catch (socketError) {
    console.error(
      'SOS socket notification failed:',
      socketError.message
    );
  }

  // ========================================
  // BUILD RESPONSE MESSAGE
  // ========================================
  let responseMessage = 'SOS alert saved successfully.';

  if (emailStatus === 'sent') {
    responseMessage += ' Email notifications sent.';
  } else if (emailStatus === 'partially_sent') {
    responseMessage +=
      ' Some email notifications were sent; others failed.';
  } else if (emailStatus === 'failed') {
    responseMessage +=
      ' Email notifications failed; check EmailJS configuration and backend logs.';
  } else if (emailStatus === 'no_email_contacts') {
    responseMessage +=
      ' No emergency contact has an email address.';
  } else {
    responseMessage +=
      ' Email notifications are not configured or could not be sent.';
  }

  if (smsStatus === 'sent') {
    responseMessage +=
      ' TextBee accepted all SMS requests.';
  } else if (smsStatus === 'partially_sent') {
    responseMessage +=
      ' Some SMS requests succeeded; others failed.';
  } else if (smsStatus === 'failed') {
    responseMessage +=
      ' SMS requests failed; check backend logs and TextBee API key.';
  } else if (smsStatus === 'no_contacts') {
    responseMessage +=
      ' No emergency contacts are available for SMS.';
  } else {
    responseMessage +=
      ' SMS is not configured or could not be sent.';
  }

  return res.status(201).json(
    new ApiResponse(
      201,
      {
        sos,
        emergency,
        location: {
          latitude,
          longitude,
          mapsUrl: validMapsUrl,
          accuracy,
          timestamp
        },
        messaging: {
          email: emailStatus,
          emailSent,
          emailFailed,
          sms: smsStatus,
          smsSent,
          smsFailed
        }
      },
      responseMessage
    )
  );
});

// ==========================================
// GET LOGGED-IN USER'S SOS HISTORY
// ==========================================
const getMySOS = asyncHandler(async (req, res) => {
  const alerts = await SOSAlert.find({
    user: req.user._id
  })
    .populate('linkedEmergency')
    .sort({ createdAt: -1 });

  return res.status(200).json(
    new ApiResponse(200, alerts)
  );
});

// ==========================================
// RESOLVE SOS
// ==========================================
const resolveSOS = asyncHandler(async (req, res) => {
  const sos = await SOSAlert.findOneAndUpdate(
    {
      _id: req.params.id,
      user: req.user._id
    },
    {
      status: 'resolved',
      resolvedAt: new Date()
    },
    {
      new: true,
      runValidators: true
    }
  );

  if (!sos) {
    throw new ApiError(
      404,
      'SOS not found or you are not authorized to resolve it'
    );
  }

  if (sos.linkedEmergency) {
    await Emergency.findByIdAndUpdate(
      sos.linkedEmergency,
      {
        status: 'resolved',
        resolvedAt: new Date()
      }
    );
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      sos,
      'SOS resolved successfully'
    )
  );
});

// ==========================================
// GET ALL SOS ALERTS FOR DISPATCHER
// ==========================================
const getAllSOS = asyncHandler(async (req, res) => {
  const alerts = await SOSAlert.find()
    .populate('user', 'name phone')
    .populate('linkedEmergency')
    .sort({ createdAt: -1 });

  return res.status(200).json(
    new ApiResponse(200, alerts)
  );
});

// ==========================================
// EXPORT CONTROLLERS
// ==========================================
module.exports = {
  triggerSOS,
  getMySOS,
  resolveSOS,
  getAllSOS,
  saveEmergencyContacts,
  getEmergencyContacts
};