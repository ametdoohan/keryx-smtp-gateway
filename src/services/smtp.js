const { SMTPServer } = require('smtp-server');
const db = require('../db');

function parseHeader(content, name) {
  const m = content.toString('utf8').match(new RegExp(`^${name}:\\s*(.*)$`, 'im'));
  return m ? m[1].trim() : '';
}

function getDomain(email) {
  const parts = (email || '').split('@');
  return parts.length === 2 ? parts[1].toLowerCase() : '';
}

function createServer({ mode, host, port, tls, ses }) {
  const server = new SMTPServer({
    secure: mode === 'smtps',
    hideSTARTTLS: mode !== 'starttls',
    requireTLS: mode === 'starttls',
    ...(mode !== 'smtp' ? tls : {}),
    authOptional: false,

    onAuth(auth, session, cb) {
      const username = String(auth.username || '');
      const password = String(auth.password || '');
      // eslint-disable-next-line no-console
      console.log('[SMTP] Auth attempt:', { username, method: auth.method });
      const user = db.getUserByUsername(username);
      if (!user || !user.is_active || !db.verifyPassword(user, password)) {
        // eslint-disable-next-line no-console
        console.log('[SMTP] Auth failed:', { userFound: !!user, isActive: user?.is_active, passwordOk: user ? db.verifyPassword(user, password) : false });
        return cb(new Error('Invalid credentials'));
      }
      // eslint-disable-next-line no-console
      console.log('[SMTP] Auth success:', user.username);
      return cb(null, { user: { userId: user.id, username: user.username, allowedSenderDomain: user.allowed_sender_domain || '', allowedRecipientDomain: user.allowed_recipient_domain || '' } });
    },

    onMailFrom(address, session, cb) {
      const allowedDomain = session.user?.allowedSenderDomain;
      if (allowedDomain) {
        const senderAddress = (address.address || '').toLowerCase();
        const senderDomain = getDomain(address.address);
        const allowed = allowedDomain.split(',').map((d) => d.trim().toLowerCase());
        // Support both full email (user@domain.com) and domain-only (domain.com) entries
        const match = allowed.some((entry) => entry.includes('@') ? senderAddress === entry : senderDomain === entry);
        if (!match) {
          // eslint-disable-next-line no-console
          console.log('[SMTP] Sender domain rejected:', { from: address.address, allowed: allowedDomain, user: session.user.username });
          return cb(new Error(`Sender "${senderAddress}" not allowed. Permitted: ${allowedDomain}`));
        }
      }
      return cb();
    },

    onRcptTo(address, session, cb) {
      const recipientDomain = getDomain(address.address);

      // 1. Per-user allowed recipient domain
      const userAllowed = session.user?.allowedRecipientDomain;
      if (userAllowed) {
        const allowed = userAllowed.split(',').map((d) => d.trim().toLowerCase());
        if (!allowed.includes(recipientDomain)) {
          // eslint-disable-next-line no-console
          console.log('[SMTP] Recipient domain rejected (per-user):', { to: address.address, allowed: userAllowed, user: session.user.username });
          return cb(new Error(`Recipient domain "${recipientDomain}" not allowed for your account. Permitted: ${userAllowed}`));
        }
      }

      // 2. Global allowed recipient domains (fallback if per-user is empty)
      const globalAllowed = db.getSetting('allowed_recipient_domains', '');
      if (!userAllowed && globalAllowed) {
        const allowed = globalAllowed.split(',').map((d) => d.trim().toLowerCase());
        if (!allowed.includes(recipientDomain)) {
          // eslint-disable-next-line no-console
          console.log('[SMTP] Recipient domain rejected (global):', { to: address.address, allowed: globalAllowed, user: session.user?.username });
          return cb(new Error(`Recipient domain "${recipientDomain}" not allowed. Permitted: ${globalAllowed}`));
        }
      }

      return cb();
    },

    onData(stream, session, cb) {
      const chunks = [];
      stream.on('data', (c) => chunks.push(c));
      stream.on('end', async () => {
        const raw = Buffer.concat(chunks);
        const from = session.envelope.mailFrom?.address || '';
        const to = (session.envelope.rcptTo || []).map((x) => x.address).join(',');
        const subject = parseHeader(raw, 'Subject');
        const userId = session.user?.userId;
        try {
          await ses.sendRaw(raw);
          db.logMessage({ userId, from, to, subject, status: 'sent' });
          cb();
        } catch (err) {
          db.logMessage({ userId, from, to, subject, status: 'failed', error: err.message });
          cb(err);
        }
      });
    },
    disabledCommands: ['STARTTLS'],
  });

  if (mode === 'starttls') {
    server.options.disabledCommands = [];
  }

  server.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[SMTP] Server error (non-fatal):', err.message);
  });

  return {
    start: () => new Promise((resolve) => server.listen(port, host, resolve)),
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}

module.exports = { createServer };
