const configuredAdminEmails = () => {
  const emails = [process.env.ADMIN_EMAIL_1, process.env.ADMIN_EMAIL_2]
    .map((email) => email?.trim().toLowerCase())

  if (emails.some((email) => !email) || emails[0] === emails[1]) return []

  return emails
}

const isConfiguredAdminEmail = (email) =>
  typeof email === 'string' &&
  configuredAdminEmails().includes(email.trim().toLowerCase())

module.exports = { configuredAdminEmails, isConfiguredAdminEmail }