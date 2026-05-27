const path = require('path');

module.exports = {
  appPort: Number(process.env.APP_PORT || 3000),
  dbPath: process.env.SQLITE_PATH || path.join(process.cwd(), 'data', 'gateway.db'),
  smtpHost: process.env.SMTP_HOST || '0.0.0.0',
  smtpPort: Number(process.env.SMTP_PORT || 2465),
  smtpMode: process.env.SMTP_MODE || 'smtps',
  certPath: process.env.SMTP_CERT_PATH || path.join(process.cwd(), 'certs', 'smtp.crt'),
  keyPath: process.env.SMTP_KEY_PATH || path.join(process.cwd(), 'certs', 'smtp.key'),
  sesRegion: process.env.AWS_REGION || 'us-east-1',
  sesDryRun: process.env.SES_DRY_RUN !== 'false',
  sessionSecret: process.env.SESSION_SECRET || 'change-me',
};
