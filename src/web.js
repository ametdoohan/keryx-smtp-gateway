const express = require('express');
const session = require('express-session');
const csrf = require('csurf');
const { rateLimit } = require('express-rate-limit');
const db = require('./db');
const config = require('./config');
const { encryptSetting } = require('./services/secure-settings');

const app = express();
app.set('view engine', 'ejs');
app.set('views', `${process.cwd()}/src/views`);
app.use(express.urlencoded({ extended: true }));
app.set('trust proxy', 1);
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  },
}));
app.use(csrf());
app.use((req, res, next) => {
  res.locals.csrfToken = req.csrfToken();
  res.locals.formatTime = (utcStr) => {
    if (!utcStr) return '';
    const tz = db.getSetting('timezone', config.timezone);
    try {
      const date = new Date(utcStr + (utcStr.endsWith('Z') ? '' : 'Z'));
      return date.toLocaleString('sv-SE', { timeZone: tz }).replace('T', ' ');
    } catch {
      return utcStr;
    }
  };
  res.locals.timezone = db.getSetting('timezone', config.timezone);
  next();
});

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: 'Too many login attempts',
});

// --- Role hierarchy & middleware ---
const ROLES = ['user', 'admin', 'superadmin'];

function roleLevel(role) {
  const idx = ROLES.indexOf(role);
  return idx >= 0 ? idx : -1;
}

function auth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  return next();
}

function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    if (!allowed.includes(req.session.user.role)) {
      return res.status(403).render('forbidden', { user: req.session.user });
    }
    return next();
  };
}

// --- Routes ---
app.get('/', (req, res) => res.redirect('/login'));
app.get('/login', (req, res) => res.render('login', { error: null }));
app.post('/login', loginLimiter, (req, res) => {
  const user = db.getUserByUsername(req.body.username);
  if (!user || !db.verifyPassword(user, req.body.password) || !user.is_active) {
    return res.status(401).render('login', { error: 'Invalid credentials' });
  }
  req.session.user = { id: user.id, username: user.username, role: user.role };
  // Redirect based on role
  if (user.role === 'user') return res.redirect('/reports');
  return res.redirect('/admin');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// --- Admin dashboard (admin + superadmin) ---
app.get('/admin', requireRole('admin', 'superadmin'), (req, res) => {
  const users = db.listUsers();
  const settings = {
    smtp_mode: db.getSetting('smtp_mode', config.smtpMode),
    smtp_host: db.getSetting('smtp_host', config.smtpHost),
    smtp_port: db.getSetting('smtp_port', config.smtpPort),
    aws_region: db.getSetting('aws_region', config.sesRegion),
    aws_access_key_id_configured: !!db.getSetting('aws_access_key_id', ''),
    aws_secret_access_key_configured: !!db.getSetting('aws_secret_access_key', ''),
    allowed_recipient_domains: db.getSetting('allowed_recipient_domains', ''),
    timezone: db.getSetting('timezone', config.timezone),
  };
  const flash = req.session.flash || null;
  delete req.session.flash;
  res.render('admin', { users, settings, user: req.session.user, flash });
});

// --- User management (admin can create user/admin, superadmin can create all) ---
app.post('/admin/users', requireRole('admin', 'superadmin'), (req, res) => {
  const creatorRole = req.session.user.role;
  const targetRole = req.body.role || 'user';

  // Admins cannot create superadmins
  if (creatorRole === 'admin' && targetRole === 'superadmin') {
    req.session.flash = 'Permission denied: cannot create superadmin users';
    return res.redirect('/admin');
  }

  db.createUser({
    username: req.body.username,
    password: req.body.password,
    role: targetRole,
    is_active: req.body.is_active === 'on',
    daily_quota: req.body.daily_quota,
    monthly_quota: req.body.monthly_quota,
    allowed_sender_domain: req.body.allowed_sender_domain,
    allowed_recipient_domain: req.body.allowed_recipient_domain,
  });
  req.session.flash = `User "${req.body.username}" created successfully`;
  return res.redirect('/admin');
});

// --- Toggle user active status (admin + superadmin) ---
app.post('/admin/users/:id/toggle', requireRole('admin', 'superadmin'), (req, res) => {
  const targetUser = db.getUserById(Number(req.params.id));
  if (!targetUser) {
    req.session.flash = 'User not found';
    return res.redirect('/admin');
  }

  // Cannot modify users with higher or equal role (unless superadmin)
  if (req.session.user.role !== 'superadmin' && roleLevel(targetUser.role) >= roleLevel(req.session.user.role)) {
    req.session.flash = 'Permission denied: cannot modify this user';
    return res.redirect('/admin');
  }

  // Cannot deactivate yourself
  if (targetUser.id === req.session.user.id) {
    req.session.flash = 'Cannot deactivate your own account';
    return res.redirect('/admin');
  }

  db.toggleUserActive(targetUser.id);
  req.session.flash = `User "${targetUser.username}" ${targetUser.is_active ? 'deactivated' : 'activated'}`;
  return res.redirect('/admin');
});

// --- Delete user (superadmin only) ---
app.post('/admin/users/:id/delete', requireRole('superadmin'), (req, res) => {
  const targetUser = db.getUserById(Number(req.params.id));
  if (!targetUser) {
    req.session.flash = 'User not found';
    return res.redirect('/admin');
  }
  if (targetUser.id === req.session.user.id) {
    req.session.flash = 'Cannot delete your own account';
    return res.redirect('/admin');
  }
  db.deleteUser(targetUser.id);
  req.session.flash = `User "${targetUser.username}" deleted`;
  return res.redirect('/admin');
});

// --- Settings (superadmin only) ---
app.post('/admin/settings', requireRole('superadmin'), (req, res) => {
  if (!['smtp', 'smtps', 'starttls'].includes(req.body.smtp_mode)) {
    return res.status(400).send('Invalid mode');
  }
  const awsRegion = (req.body.aws_region || '').trim();
  if (!awsRegion) return res.status(400).send('Invalid AWS region');

  db.setSetting('smtp_mode', req.body.smtp_mode);
  db.setSetting('smtp_host', req.body.smtp_host);
  db.setSetting('smtp_port', req.body.smtp_port);
  db.setSetting('aws_region', awsRegion);
  db.setSetting('allowed_recipient_domains', (req.body.allowed_recipient_domains || '').trim());
  db.setSetting('timezone', (req.body.timezone || 'Asia/Jakarta').trim());

  if (req.body.clear_aws_access_key_id === 'on') {
    db.setSetting('aws_access_key_id', '');
  } else if ((req.body.aws_access_key_id || '').trim()) {
    db.setSetting('aws_access_key_id', encryptSetting(req.body.aws_access_key_id.trim()));
  }

  if (req.body.clear_aws_secret_access_key === 'on') {
    db.setSetting('aws_secret_access_key', '');
  } else if ((req.body.aws_secret_access_key || '').trim()) {
    db.setSetting('aws_secret_access_key', encryptSetting(req.body.aws_secret_access_key.trim()));
  }

  req.session.flash = 'Settings saved successfully';
  return res.redirect('/admin');
});

// --- Reports (all authenticated users) ---
app.get('/reports', auth, (req, res) => {
  // Regular users only see their own messages
  const userId = req.session.user.role === 'user' ? req.session.user.id : null;
  const data = db.report(req.query.status || '', userId);
  res.render('reports', { data, status: req.query.status || '', user: req.session.user });
});

app.get('/reports.csv', auth, (req, res) => {
  const userId = req.session.user.role === 'user' ? req.session.user.id : null;
  const data = db.report(req.query.status || '', userId);
  const rows = data.rows;
  const csv = ['id,auth_user,from,to,subject,status,error,created_at', ...rows.map((r) =>
    [r.id, r.auth_user || '', r.from_address, r.to_address, JSON.stringify(r.subject || ''), r.status, JSON.stringify(r.error_message || ''), r.created_at].join(',')
  )].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.send(csv);
});

app.use((err, req, res, next) => {
  if (err && err.code === 'EBADCSRFTOKEN') {
    return res.status(403).send('Invalid CSRF token');
  }
  return next(err);
});

module.exports = app;
