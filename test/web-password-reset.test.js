const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');

const testDbPath = path.join(__dirname, '..', 'data', 'test-pwreset.db');
process.env.SQLITE_PATH = testDbPath;
process.env.SESSION_SECRET = 'test-pwreset-secret';

if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

const db = require('../src/db');
db.seedAdmin(); // admin with default password admin123

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

async function loginAndGetSession(username, password) {
  const loginPage = await request('/login');
  const csrfMatch = loginPage.body.match(/name="_csrf" value="([^"]+)"/);
  const cookies = (Array.isArray(loginPage.headers['set-cookie']) ? loginPage.headers['set-cookie'] : [loginPage.headers['set-cookie']]).map((c) => c.split(';')[0]).join('; ');

  const res = await request('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookies },
    body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&_csrf=${encodeURIComponent(csrfMatch[1])}`,
  });

  const sessionCookies = res.headers['set-cookie']
    ? (Array.isArray(res.headers['set-cookie']) ? res.headers['set-cookie'] : [res.headers['set-cookie']])
        .map((c) => c.split(';')[0]).join('; ')
    : cookies;

  return { status: res.status, location: res.headers.location, cookies: sessionCookies };
}

async function getCsrfFromPage(urlPath, cookies) {
  const page = await request(urlPath, { headers: { 'Cookie': cookies } });
  const match = page.body.match(/name="_csrf" value="([^"]+)"/);
  return { csrf: match ? match[1] : '', body: page.body, status: page.status };
}

describe('Forced Password Reset', () => {
  before((_, done) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      done();
    });
  });

  after((_, done) => { server.close(done); });

  it('login with default password redirects to /change-password', async () => {
    const session = await loginAndGetSession('admin', 'admin123');
    assert.equal(session.status, 302);
    assert.ok(session.location.includes('/change-password'));
  });

  it('GET /change-password shows the form', async () => {
    const session = await loginAndGetSession('admin', 'admin123');
    const page = await request('/change-password', { headers: { 'Cookie': session.cookies } });
    assert.equal(page.status, 200);
    assert.ok(page.body.includes('Change Password Required'));
  });

  it('rejects password shorter than 8 characters', async () => {
    const session = await loginAndGetSession('admin', 'admin123');
    const { csrf } = await getCsrfFromPage('/change-password', session.cookies);
    const res = await request('/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': session.cookies },
      body: `new_password=short&confirm_password=short&_csrf=${encodeURIComponent(csrf)}`,
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.includes('at least 8 characters'));
  });

  it('rejects mismatched passwords', async () => {
    const session = await loginAndGetSession('admin', 'admin123');
    const { csrf } = await getCsrfFromPage('/change-password', session.cookies);
    const res = await request('/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': session.cookies },
      body: `new_password=newpass123&confirm_password=different1&_csrf=${encodeURIComponent(csrf)}`,
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.includes('do not match'));
  });

  it('rejects reuse of default password', async () => {
    const session = await loginAndGetSession('admin', 'admin123');
    const { csrf } = await getCsrfFromPage('/change-password', session.cookies);
    const res = await request('/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': session.cookies },
      body: `new_password=admin123&confirm_password=admin123&_csrf=${encodeURIComponent(csrf)}`,
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.includes('Cannot reuse'));
  });

  it('successful password change redirects to /admin', async () => {
    const session = await loginAndGetSession('admin', 'admin123');
    const { csrf } = await getCsrfFromPage('/change-password', session.cookies);
    const res = await request('/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': session.cookies },
      body: `new_password=mynewpass1&confirm_password=mynewpass1&_csrf=${encodeURIComponent(csrf)}`,
    });
    assert.equal(res.status, 302);
    assert.ok(res.headers.location.includes('/admin'));

    // Verify new password works
    const user = db.getUserByUsername('admin');
    assert.ok(db.verifyPassword(user, 'mynewpass1'));
  });
});
