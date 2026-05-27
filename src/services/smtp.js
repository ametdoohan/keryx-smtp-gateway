const { SMTPServer } = require('smtp-server');
const db = require('../db');

function parseHeader(content, name) {
  const m = content.toString('utf8').match(new RegExp(`^${name}:\\s*(.*)$`, 'im'));
  return m ? m[1].trim() : '';
}

function createServer({ mode, host, port, tls, ses }) {
  const server = new SMTPServer({
    secure: mode === 'smtps',
    hideSTARTTLS: mode !== 'starttls',
    requireTLS: mode === 'starttls',
    ...(mode !== 'smtp' ? tls : {}),
    authOptional: false,
    onAuth(auth, session, cb) {
      const user = db.getUserByUsername(auth.username);
      if (!user || !user.is_active || !db.verifyPassword(user, auth.password)) {
        return cb(new Error('Invalid credentials'));
      }
      return cb(null, { userId: user.id, username: user.username });
    },
    onData(stream, session, cb) {
      const chunks = [];
      stream.on('data', (c) => chunks.push(c));
      stream.on('end', async () => {
        const raw = Buffer.concat(chunks);
        const from = session.envelope.mailFrom?.address || '';
        const to = (session.envelope.rcptTo || []).map((x) => x.address).join(',');
        const subject = parseHeader(raw, 'Subject');
        try {
          await ses.sendRaw(raw);
          db.logMessage({ userId: session.user.userId, from, to, subject, status: 'sent' });
          cb();
        } catch (err) {
          db.logMessage({ userId: session.user.userId, from, to, subject, status: 'failed', error: err.message });
          cb(err);
        }
      });
    },
    disabledCommands: ['STARTTLS'],
  });

  if (mode === 'starttls') {
    server.options.disabledCommands = [];
  }

  return {
    start: () => new Promise((resolve) => server.listen(port, host, resolve)),
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}

module.exports = { createServer };
