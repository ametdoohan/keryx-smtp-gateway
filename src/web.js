const express = require('express');
const session = require('express-session');
const db = require('./db');
const config = require('./config');

const app = express();
app.set('view engine', 'ejs');
app.set('views', `${process.cwd()}/src/views`);
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: config.sessionSecret, resave: false, saveUninitialized: false }));

function auth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  return next();
}

app.get('/login', (req, res) => res.render('login', { error: null }));
app.post('/login', (req, res) => {
  const user = db.getUserByUsername(req.body.username);
  if (!user || !db.verifyPassword(user, req.body.password) || !user.is_active) {
    return res.status(401).render('login', { error: 'Invalid credentials' });
  }
  req.session.user = { id: user.id, username: user.username, role: user.role };
  return res.redirect('/admin');
});

app.get('/admin', auth, (req, res) => {
  const users = db.listUsers();
  const settings = {
    smtp_mode: db.getSetting('smtp_mode', config.smtpMode),
    smtp_host: db.getSetting('smtp_host', config.smtpHost),
    smtp_port: db.getSetting('smtp_port', config.smtpPort),
  };
  res.render('admin', { users, settings, user: req.session.user });
});

app.post('/admin/users', auth, (req, res) => {
  db.createUser({
    username: req.body.username,
    password: req.body.password,
    role: req.body.role,
    is_active: req.body.is_active === 'on',
    daily_quota: req.body.daily_quota,
    monthly_quota: req.body.monthly_quota,
    allowed_sender_domain: req.body.allowed_sender_domain,
  });
  res.redirect('/admin');
});

app.post('/admin/settings', auth, (req, res) => {
  if (!['smtp', 'smtps', 'starttls'].includes(req.body.smtp_mode)) {
    return res.status(400).send('Invalid mode');
  }
  db.setSetting('smtp_mode', req.body.smtp_mode);
  db.setSetting('smtp_host', req.body.smtp_host);
  db.setSetting('smtp_port', req.body.smtp_port);
  return res.redirect('/admin');
});

app.get('/reports', auth, (req, res) => {
  const data = db.report(req.query.status || '');
  res.render('reports', { data, status: req.query.status || '' });
});

app.get('/reports.csv', auth, (req, res) => {
  const data = db.report(req.query.status || '');
  const rows = data.rows;
  const csv = ['id,from,to,subject,status,error,created_at', ...rows.map((r) =>
    [r.id, r.from_address, r.to_address, JSON.stringify(r.subject || ''), r.status, JSON.stringify(r.error_message || ''), r.created_at].join(',')
  )].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.send(csv);
});

module.exports = app;
