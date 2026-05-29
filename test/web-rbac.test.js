const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');

const testDbPath = path.join(__dirname, '..', 'data', 'test-rbac.db');
process.env.SQLITE_PATH = testDbPath;
process.env.SESSION_SECRET = 'test-rbac-secret';

if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

const db = require('../src/db');
db.seedAdmin();
// Change admin password so it doesn't trigger forced reset
db.updatePassword(db.getUserByUsername('admin').id, 'superpass1');
// Create admin-role user
db.createUser({ username: 'myadmin', password: 'adminpass1', role: 'admin', is_active: true });
// Create user-role user
db.createUser({ username: 'myuser', password: 'userpass1', role: 'user', is_active: true });

const app = require('../src/web');

let server;
let baseUrl;

function request(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, baseUrl);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };
    const req = http.request(opts, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function login(username, password) {
  const loginPage = await request('/login');
  const csrfMatch = loginPage.body.match(/name="_csrf" value="([^"]+)"/);
  const cookieHeader = loginPage.headers['set-cookie'];
  const cookies = cookieHeader ? (Array.isArray(cookieHeader) ? cookieHeader : [cookieHeader]).map((c) => c.split(';')[0]).join('; ') : '';

  const res = await request('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookies },
    body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&_csrf=${encodeURIComponent(csrfMatch[1])}`,
  });

  // Follow redirect and collect session cookie
  const sessionCookies = res.headers['set-cookie']
    ? (Array.isArray(res.headers['set-cookie']) ? res.headers['set-cookie'] : [res.headers['set-cookie']])
        .map((c) => c.split(';')[0]).join('; ')
    : cookies;

  return { cookies: sessionCookies, csrf: csrfMatch[1] };
}

async function getCsrf(cookies) {
  const page = await request('/admin', { headers: { 'Cookie': cookies } });
  const match = page.body.match(/name="_csrf" value="([^"]+)"/);
  return match ? match[1] : '';
}

describe('RBAC - Role-Based Access Control', () => {
  before((_, done) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      done();
    });
  });

  after((_, done) => { server.close(done); });

  describe('User role restrictions', () => {
    it('user role should be redirected to /reports after login', async () => {
      const loginPage = await request('/login');
      const csrfMatch = loginPage.body.match(/name="_csrf" value="([^"]+)"/);
      const cookies = (Array.isArray(loginPage.headers['set-cookie']) ? loginPage.headers['set-cookie'] : [loginPage.headers['set-cookie']]).map((c) => c.split(';')[0]).join('; ');

      const res = await request('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookies },
        body: `username=myuser&password=userpass1&_csrf=${encodeURIComponent(csrfMatch[1])}`,
      });
      assert.equal(res.status, 302);
      assert.ok(res.headers.location.includes('/reports'));
    });

    it('user role should get 403 on /admin', async () => {
      const session = await login('myuser', 'userpass1');
      const res = await request('/admin', { headers: { 'Cookie': session.cookies } });
      assert.equal(res.status, 403);
      assert.ok(res.body.includes('Access Denied'));
    });
  });

  describe('Admin role restrictions', () => {
    it('admin should access /admin', async () => {
      const session = await login('myadmin', 'adminpass1');
      const res = await request('/admin', { headers: { 'Cookie': session.cookies } });
      assert.equal(res.status, 200);
      assert.ok(res.body.includes('Dashboard'));
    });

    it('admin should NOT be able to POST /admin/settings (superadmin only)', async () => {
      const session = await login('myadmin', 'adminpass1');
      const csrf = await getCsrf(session.cookies);
      const res = await request('/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': session.cookies },
        body: `smtp_mode=smtp&smtp_host=0.0.0.0&smtp_port=25&aws_region=us-east-1&_csrf=${encodeURIComponent(csrf)}`,
      });
      assert.equal(res.status, 403);
    });

    it('admin should NOT be able to create superadmin user', async () => {
      const session = await login('myadmin', 'adminpass1');
      const csrf = await getCsrf(session.cookies);
      const res = await request('/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': session.cookies },
        body: `username=hacker&password=longpass1&role=superadmin&is_active=on&daily_quota=1000&monthly_quota=20000&_csrf=${encodeURIComponent(csrf)}`,
      });
      // Should redirect back with flash (permission denied)
      assert.equal(res.status, 302);
      // Verify user was NOT created
      assert.equal(db.getUserByUsername('hacker'), undefined);
    });

    it('admin should NOT be able to delete users', async () => {
      const session = await login('myadmin', 'adminpass1');
      const csrf = await getCsrf(session.cookies);
      const target = db.getUserByUsername('myuser');
      const res = await request(`/admin/users/${target.id}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': session.cookies },
        body: `_csrf=${encodeURIComponent(csrf)}`,
      });
      assert.equal(res.status, 403);
      // User still exists
      assert.ok(db.getUserByUsername('myuser'));
    });
  });

  describe('Superadmin full access', () => {
    it('superadmin should access /admin', async () => {
      const session = await login('admin', 'superpass1');
      const res = await request('/admin', { headers: { 'Cookie': session.cookies } });
      assert.equal(res.status, 200);
    });

    it('superadmin should POST /admin/settings', async () => {
      const session = await login('admin', 'superpass1');
      const csrf = await getCsrf(session.cookies);
      const res = await request('/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': session.cookies },
        body: `smtp_mode=starttls&smtp_host=0.0.0.0&smtp_port=587&aws_region=ap-southeast-3&timezone=Asia/Jakarta&_csrf=${encodeURIComponent(csrf)}`,
      });
      assert.equal(res.status, 302);
      assert.equal(db.getSetting('smtp_mode'), 'starttls');
    });
  });
});
