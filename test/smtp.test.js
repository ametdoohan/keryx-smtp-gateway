const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Use a temp DB for tests
const testDbPath = path.join(__dirname, '..', 'data', 'test-smtp.db');
process.env.SQLITE_PATH = testDbPath;
process.env.SESSION_SECRET = 'test-smtp-secret';

if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

const db = require('../src/db');

// Test the domain matching logic extracted from smtp.js
function getDomain(email) {
  const parts = (email || '').split('@');
  return parts.length === 2 ? parts[1].toLowerCase() : '';
}

function checkSenderAllowed(senderAddress, allowedDomain) {
  if (!allowedDomain) return true;
  const address = (senderAddress || '').toLowerCase();
  const domain = getDomain(senderAddress);
  const allowed = allowedDomain.split(',').map((d) => d.trim().toLowerCase());
  return allowed.some((entry) => entry.includes('@') ? address === entry : domain === entry);
}

function checkRecipientAllowed(recipientAddress, userAllowed, globalAllowed) {
  const domain = getDomain(recipientAddress);

  if (userAllowed) {
    const allowed = userAllowed.split(',').map((d) => d.trim().toLowerCase());
    return allowed.includes(domain);
  }

  if (globalAllowed) {
    const allowed = globalAllowed.split(',').map((d) => d.trim().toLowerCase());
    return allowed.includes(domain);
  }

  return true; // No restrictions
}

describe('SMTP Domain Enforcement', () => {
  describe('Sender domain check', () => {
    it('should allow when no restriction set', () => {
      assert.ok(checkSenderAllowed('user@example.com', ''));
    });

    it('should allow matching domain', () => {
      assert.ok(checkSenderAllowed('user@inhealth.co.id', 'inhealth.co.id'));
    });

    it('should reject non-matching domain', () => {
      assert.ok(!checkSenderAllowed('user@evil.com', 'inhealth.co.id'));
    });

    it('should allow matching full email address', () => {
      assert.ok(checkSenderAllowed('noreply@inhealth.co.id', 'noreply@inhealth.co.id'));
    });

    it('should reject non-matching full email address', () => {
      assert.ok(!checkSenderAllowed('other@inhealth.co.id', 'noreply@inhealth.co.id'));
    });

    it('should support comma-separated domains', () => {
      assert.ok(checkSenderAllowed('user@b.com', 'a.com,b.com,c.com'));
      assert.ok(!checkSenderAllowed('user@d.com', 'a.com,b.com,c.com'));
    });

    it('should support mixed email and domain entries', () => {
      assert.ok(checkSenderAllowed('noreply@a.com', 'noreply@a.com,b.com'));
      assert.ok(checkSenderAllowed('anyone@b.com', 'noreply@a.com,b.com'));
      assert.ok(!checkSenderAllowed('other@a.com', 'noreply@a.com,b.com'));
    });
  });

  describe('Recipient domain check', () => {
    it('should allow when no restrictions set', () => {
      assert.ok(checkRecipientAllowed('user@anywhere.com', '', ''));
    });

    it('should enforce per-user restriction', () => {
      assert.ok(checkRecipientAllowed('user@inhealth.co.id', 'inhealth.co.id', ''));
      assert.ok(!checkRecipientAllowed('user@gmail.com', 'inhealth.co.id', ''));
    });

    it('should enforce global restriction when per-user is empty', () => {
      assert.ok(checkRecipientAllowed('user@inhealth.co.id', '', 'inhealth.co.id,ifg-life.id'));
      assert.ok(!checkRecipientAllowed('user@gmail.com', '', 'inhealth.co.id,ifg-life.id'));
    });

    it('per-user should take priority over global', () => {
      // User allowed only inhealth.co.id, global allows more
      assert.ok(checkRecipientAllowed('user@inhealth.co.id', 'inhealth.co.id', 'inhealth.co.id,gmail.com'));
      assert.ok(!checkRecipientAllowed('user@gmail.com', 'inhealth.co.id', 'inhealth.co.id,gmail.com'));
    });

    it('should support multiple comma-separated domains', () => {
      assert.ok(checkRecipientAllowed('a@inhealth.co.id', 'inhealth.co.id,mandiriinhealth.co.id,ifg-life.id', ''));
      assert.ok(checkRecipientAllowed('b@ifg-life.id', 'inhealth.co.id,mandiriinhealth.co.id,ifg-life.id', ''));
      assert.ok(!checkRecipientAllowed('c@live.com', 'inhealth.co.id,mandiriinhealth.co.id,ifg-life.id', ''));
    });
  });
});
