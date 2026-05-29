const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Use a temp DB for tests
const testDbPath = path.join(__dirname, '..', 'data', 'test-gateway.db');
process.env.SQLITE_PATH = testDbPath;

// Clean up before loading
if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

const db = require('../src/db');

describe('Database', () => {
  beforeEach(() => {
    // Reset users table for each test
    const Database = require('better-sqlite3');
    const conn = new Database(testDbPath);
    conn.exec('DELETE FROM users');
    conn.exec('DELETE FROM message_logs');
    conn.exec('DELETE FROM settings');
    conn.close();
  });

  describe('seedAdmin', () => {
    it('should create default admin user', () => {
      db.seedAdmin();
      const user = db.getUserByUsername('admin');
      assert.ok(user);
      assert.equal(user.username, 'admin');
      assert.equal(user.role, 'superadmin');
      assert.equal(user.is_active, 1);
    });

    it('should not duplicate admin on second call', () => {
      db.seedAdmin();
      db.seedAdmin();
      const users = db.listUsers();
      const admins = users.filter((u) => u.username === 'admin');
      assert.equal(admins.length, 1);
    });
  });

  describe('createUser / getUserByUsername', () => {
    it('should create a user and retrieve by username', () => {
      db.createUser({
        username: 'testuser',
        password: 'pass123',
        role: 'user',
        is_active: true,
        daily_quota: 500,
        monthly_quota: 10000,
        allowed_sender_domain: 'example.com',
        allowed_recipient_domain: 'example.com,other.com',
      });
      const user = db.getUserByUsername('testuser');
      assert.ok(user);
      assert.equal(user.username, 'testuser');
      assert.equal(user.role, 'user');
      assert.equal(user.daily_quota, 500);
      assert.equal(user.allowed_sender_domain, 'example.com');
      assert.equal(user.allowed_recipient_domain, 'example.com,other.com');
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', () => {
      db.createUser({ username: 'pwuser', password: 'secret', role: 'user', is_active: true });
      const user = db.getUserByUsername('pwuser');
      assert.ok(db.verifyPassword(user, 'secret'));
    });

    it('should reject wrong password', () => {
      db.createUser({ username: 'pwuser2', password: 'secret', role: 'user', is_active: true });
      const user = db.getUserByUsername('pwuser2');
      assert.ok(!db.verifyPassword(user, 'wrong'));
    });
  });

  describe('getUserById', () => {
    it('should retrieve user by id', () => {
      db.createUser({ username: 'byid', password: 'x', role: 'admin', is_active: true });
      const user = db.getUserByUsername('byid');
      const found = db.getUserById(user.id);
      assert.equal(found.username, 'byid');
    });
  });

  describe('toggleUserActive', () => {
    it('should toggle active status', () => {
      db.createUser({ username: 'toggle', password: 'x', role: 'user', is_active: true });
      const user = db.getUserByUsername('toggle');
      assert.equal(user.is_active, 1);
      db.toggleUserActive(user.id);
      const updated = db.getUserById(user.id);
      assert.equal(updated.is_active, 0);
      db.toggleUserActive(user.id);
      const restored = db.getUserById(user.id);
      assert.equal(restored.is_active, 1);
    });
  });

  describe('deleteUser', () => {
    it('should delete a user', () => {
      db.createUser({ username: 'delme', password: 'x', role: 'user', is_active: true });
      const user = db.getUserByUsername('delme');
      db.deleteUser(user.id);
      assert.equal(db.getUserByUsername('delme'), undefined);
    });
  });

  describe('settings', () => {
    it('should set and get a setting', () => {
      db.setSetting('test_key', 'test_value');
      assert.equal(db.getSetting('test_key'), 'test_value');
    });

    it('should return fallback for missing setting', () => {
      assert.equal(db.getSetting('nonexistent', 'fallback'), 'fallback');
    });

    it('should overwrite existing setting', () => {
      db.setSetting('key1', 'a');
      db.setSetting('key1', 'b');
      assert.equal(db.getSetting('key1'), 'b');
    });
  });

  describe('logMessage / report', () => {
    it('should log and retrieve messages', () => {
      db.createUser({ username: 'logger', password: 'x', role: 'user', is_active: true });
      const user = db.getUserByUsername('logger');
      db.logMessage({ userId: user.id, from: 'a@b.com', to: 'c@d.com', subject: 'Test', status: 'sent' });
      db.logMessage({ userId: user.id, from: 'a@b.com', to: 'e@f.com', subject: 'Fail', status: 'failed', error: 'timeout' });

      const all = db.report('');
      assert.equal(all.summary.total, 2);
      assert.equal(all.summary.sent, 1);
      assert.equal(all.summary.failed, 1);

      const sent = db.report('sent');
      assert.equal(sent.rows.length, 1);
      assert.equal(sent.rows[0].subject, 'Test');
    });

    it('should filter by userId', () => {
      db.createUser({ username: 'u1', password: 'x', role: 'user', is_active: true });
      db.createUser({ username: 'u2', password: 'x', role: 'user', is_active: true });
      const u1 = db.getUserByUsername('u1');
      const u2 = db.getUserByUsername('u2');
      db.logMessage({ userId: u1.id, from: 'a@b.com', to: 'c@d.com', subject: 'U1', status: 'sent' });
      db.logMessage({ userId: u2.id, from: 'x@y.com', to: 'z@w.com', subject: 'U2', status: 'sent' });

      const u1Report = db.report('', u1.id);
      assert.equal(u1Report.rows.length, 1);
      assert.equal(u1Report.rows[0].subject, 'U1');
    });

    it('should include auth_user in report', () => {
      db.createUser({ username: 'reporter', password: 'x', role: 'user', is_active: true });
      const user = db.getUserByUsername('reporter');
      db.logMessage({ userId: user.id, from: 'a@b.com', to: 'c@d.com', subject: 'Hi', status: 'sent' });
      const report = db.report('');
      assert.equal(report.rows[0].auth_user, 'reporter');
    });
  });
});
