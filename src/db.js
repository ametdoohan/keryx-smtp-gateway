const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const config = require('./config');

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
const db = new Database(config.dbPath);

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  is_active INTEGER NOT NULL DEFAULT 1,
  daily_quota INTEGER NOT NULL DEFAULT 1000,
  monthly_quota INTEGER NOT NULL DEFAULT 20000,
  allowed_sender_domain TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS message_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  from_address TEXT,
  to_address TEXT,
  subject TEXT,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

function seedAdmin() {
  const row = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!row) {
    db.prepare('INSERT INTO users (username, password_hash, role, is_active) VALUES (?, ?, ?, 1)').run(
      'admin',
      bcrypt.hashSync('admin123', 10),
      'superadmin',
    );
  }
}

function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function verifyPassword(user, password) {
  return bcrypt.compareSync(password, user.password_hash);
}

function listUsers() {
  return db.prepare('SELECT id, username, role, is_active, daily_quota, monthly_quota, allowed_sender_domain FROM users ORDER BY id DESC').all();
}

function createUser(payload) {
  return db.prepare(`INSERT INTO users (username, password_hash, role, is_active, daily_quota, monthly_quota, allowed_sender_domain)
    VALUES (@username, @password_hash, @role, @is_active, @daily_quota, @monthly_quota, @allowed_sender_domain)`).run({
    username: payload.username,
    password_hash: bcrypt.hashSync(payload.password, 10),
    role: payload.role || 'admin',
    is_active: payload.is_active ? 1 : 0,
    daily_quota: Number(payload.daily_quota || 1000),
    monthly_quota: Number(payload.monthly_quota || 20000),
    allowed_sender_domain: payload.allowed_sender_domain || '',
  });
}

function setSetting(key, value) {
  db.prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value));
}

function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function logMessage(payload) {
  db.prepare(`INSERT INTO message_logs(user_id, from_address, to_address, subject, status, error_message)
    VALUES (?, ?, ?, ?, ?, ?)`).run(
    payload.userId || null,
    payload.from || '',
    payload.to || '',
    payload.subject || '',
    payload.status,
    payload.error || null,
  );
}

function report(status = '') {
  const rows = status
    ? db.prepare('SELECT * FROM message_logs WHERE status = ? ORDER BY id DESC LIMIT 200').all(status)
    : db.prepare('SELECT * FROM message_logs ORDER BY id DESC LIMIT 200').all();
  const summary = db.prepare(`SELECT
    COUNT(*) total,
    SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END) sent,
    SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) failed
    FROM message_logs`).get();
  return { rows, summary };
}

module.exports = {
  seedAdmin,
  getUserByUsername,
  verifyPassword,
  listUsers,
  createUser,
  setSetting,
  getSetting,
  logMessage,
  report,
};
