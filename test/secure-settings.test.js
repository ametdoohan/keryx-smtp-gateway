const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

process.env.SETTINGS_ENCRYPTION_SECRET = 'test-secret-key-for-unit-tests';

const { encryptSetting, decryptSetting } = require('../src/services/secure-settings');

describe('Secure Settings', () => {
  it('should encrypt and decrypt a value', () => {
    const original = 'AKIAIOSFODNN7EXAMPLE';
    const encrypted = encryptSetting(original);
    assert.ok(encrypted.startsWith('enc:v1:'));
    assert.notEqual(encrypted, original);
    const decrypted = decryptSetting(encrypted);
    assert.equal(decrypted, original);
  });

  it('should return empty string for empty input', () => {
    assert.equal(decryptSetting(''), '');
    assert.equal(decryptSetting(null), '');
    assert.equal(decryptSetting(undefined), '');
  });

  it('should return plain value if not encrypted', () => {
    assert.equal(decryptSetting('plain-text'), 'plain-text');
  });

  it('should produce different ciphertext each time (random IV)', () => {
    const a = encryptSetting('same-value');
    const b = encryptSetting('same-value');
    assert.notEqual(a, b);
  });

  it('should throw on tampered ciphertext', () => {
    const encrypted = encryptSetting('secret');
    const tampered = encrypted.slice(0, -2) + 'XX';
    assert.throws(() => decryptSetting(tampered));
  });
});
