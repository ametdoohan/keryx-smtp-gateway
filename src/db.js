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
  allowed_sender_domain TEXT DEFAULT '',
  allowed_recipient_domain TEXT DEFAULT ''
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

// Migration: add allowed_recipient_domain column if missing
try {
  db.exec('ALTER TABLE users ADD COLUMN allowed_recipient_domain TEXT DEFAULT ""');
} catch (e) {
  // Column already exists
}

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

function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function verifyPassword(user, password) {
  return bcrypt.compareSync(password, user.password_hash);
}

function listUsers() {
  return db.prepare('SELECT id, username, role, is_active, daily_quota, monthly_quota, allowed_sender_domain, allowed_recipient_domain FROM users ORDER BY id DESC').all();
}

function createUser(payload) {
  return db.prepare(`INSERT INTO users (username, password_hash, role, is_active, daily_quota, monthly_quota, allowed_sender_domain, allowed_recipient_domain)
    VALUES (@username, @password_hash, @role, @is_active, @daily_quota, @monthly_quota, @allowed_sender_domain, @allowed_recipient_domain)`).run({
    username: payload.username,
    password_hash: bcrypt.hashSync(payload.password, 10),
    role: payload.role || 'admin',
    is_active: payload.is_active ? 1 : 0,
    daily_quota: Number(payload.daily_quota || 1000),
    monthly_quota: Number(payload.monthly_quota || 20000),
    allowed_sender_domain: payload.allowed_sender_domain || '',
    allowed_recipient_domain: payload.allowed_recipient_domain || '',
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

function report(status = '', userId = null) {
  let rowsSql = 'SELECT message_logs.*, users.username as auth_user FROM message_logs LEFT JOIN users ON message_logs.user_id = users.id';
  let summarySql = `SELECT
    COUNT(*) total,
    SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END) sent,
    SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) failed
    FROM message_logs`;
  const conditions = [];
  const params = [];

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }
  if (userId) {
    conditions.push('user_id = ?');
    params.push(userId);
  }

  if (conditions.length) {
    const where = ' WHERE ' + conditions.join(' AND ');
    rowsSql += where;
    summarySql += where;
  }

  rowsSql += ' ORDER BY message_logs.id DESC LIMIT 200';

  const rows = db.prepare(rowsSql).all(...params);
  const summary = db.prepare(summarySql).get(...params);
  return { rows, summary };
}

function toggleUserActive(id) {
  db.prepare('UPDATE users SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?').run(id);
}

function deleteUser(id) {
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

module.exports = {
  seedAdmin,
  getUserByUsername,
  getUserById,
  verifyPassword,
  listUsers,
  createUser,
  toggleUserActive,
  deleteUser,
  setSetting,
  getSetting,
  logMessage,
  report,
};
