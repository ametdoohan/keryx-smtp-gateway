const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Use a temp DB for tests
const testDbPath = path.join(__dirname, '..', 'data', 'test-web.db');
process.env.SQLITE_PATH = testDbPath;
process.env.SESSION_SECRET = 'test-session-secret';

if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

const db = require('../src/db');
db.seedAdmin();

const app = require('../src/web');

let server;
let baseUrl;

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
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

describe('Web Routes', () => {
  before((_, done) => {
    server = app.listen(0, () => {
      const addr = server.address();
      baseUrl = `http://127.0.0.1:${addr.port}`;
      done();
    });
  });

  after((_, done) => {
    server.close(done);
  });

  it('GET / should redirect to /login', async () => {
    const res = await request('/');
    assert.equal(res.status, 302);
    assert.ok(res.headers.location.includes('/login'));
  });

  it('GET /login should return 200', async () => {
    const res = await request('/login');
    assert.equal(res.status, 200);
    assert.ok(res.body.includes('Sign in'));
  });

  it('GET /admin without auth should redirect to /login', async () => {
    const res = await request('/admin');
    assert.equal(res.status, 302);
    assert.ok(res.headers.location.includes('/login'));
  });

  it('GET /reports without auth should redirect to /login', async () => {
    const res = await request('/reports');
    assert.equal(res.status, 302);
    assert.ok(res.headers.location.includes('/login'));
  });

  it('POST /login with invalid credentials should return 401', async () => {
    // First get CSRF token
    const loginPage = await request('/login');
    const csrfMatch = loginPage.body.match(/name="_csrf" value="([^"]+)"/);
    const cookieHeader = loginPage.headers['set-cookie'];
    const cookie = cookieHeader ? (Array.isArray(cookieHeader) ? cookieHeader : [cookieHeader]).map((c) => c.split(';')[0]).join('; ') : '';

    const res = await request('/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookie,
      },
      body: `username=admin&password=wrongpass&_csrf=${encodeURIComponent(csrfMatch[1])}`,
    });
    assert.equal(res.status, 401);
    assert.ok(res.body.includes('Invalid credentials'));
  });

  it('POST /login with default password should redirect to /change-password', async () => {
    const loginPage = await request('/login');
    const csrfMatch = loginPage.body.match(/name="_csrf" value="([^"]+)"/);
    const cookieHeader = loginPage.headers['set-cookie'];
    const cookie = cookieHeader ? (Array.isArray(cookieHeader) ? cookieHeader : [cookieHeader]).map((c) => c.split(';')[0]).join('; ') : '';

    const res = await request('/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookie,
      },
      body: `username=admin&password=admin123&_csrf=${encodeURIComponent(csrfMatch[1])}`,
    });
    assert.equal(res.status, 302);
    assert.ok(res.headers.location.includes('/change-password'));
  });

  it('POST without CSRF token should return 403', async () => {
    const loginPage = await request('/login');
    const cookieHeader = loginPage.headers['set-cookie'];
    const cookie = cookieHeader ? (Array.isArray(cookieHeader) ? cookieHeader : [cookieHeader]).map((c) => c.split(';')[0]).join('; ') : '';

    const res = await request('/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookie,
      },
      body: 'username=admin&password=admin123',
    });
    assert.equal(res.status, 403);
  });

  it('GET /change-password without auth should redirect to /login', async () => {
    const res = await request('/change-password');
    assert.equal(res.status, 302);
    assert.ok(res.headers.location.includes('/login'));
  });
});
