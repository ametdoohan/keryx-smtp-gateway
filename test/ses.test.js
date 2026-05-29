const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const testDbPath = path.join(__dirname, '..', 'data', 'test-ses.db');
process.env.SQLITE_PATH = testDbPath;
process.env.SESSION_SECRET = 'test-ses-secret';
process.env.SES_DRY_RUN = 'true';

if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

const db = require('../src/db');
const SESAdapter = require('../src/services/ses');
const { encryptSetting } = require('../src/services/secure-settings');

describe('SES Adapter', () => {
  beforeEach(() => {
    const Database = require('better-sqlite3');
    const conn = new Database(testDbPath);
    conn.exec('DELETE FROM settings');
    conn.close();
  });

  it('dry run mode should return fake messageId', async () => {
    const ses = new SESAdapter();
    const result = await ses.sendRaw(Buffer.from('test'));
    assert.ok(result.messageId.startsWith('dryrun-'));
  });

  it('dry run messageId should be unique each call', async () => {
    const ses = new SESAdapter();
    const r1 = await ses.sendRaw(Buffer.from('a'));
    await new Promise((r) => setTimeout(r, 2));
    const r2 = await ses.sendRaw(Buffer.from('b'));
    assert.notEqual(r1.messageId, r2.messageId);
  });

  it('_buildClient reads fresh credentials from DB', async () => {
    db.setSetting('aws_region', 'eu-west-1');
    db.setSetting('aws_access_key_id', encryptSetting('AKIATEST123'));
    db.setSetting('aws_secret_access_key', encryptSetting('secrettest456'));

    const ses = new SESAdapter();
    const client = ses._buildClient();
    assert.ok(client);
    const region = await client.config.region();
    assert.equal(region, 'eu-west-1');
  });

  it('_buildClient uses env fallback when DB is empty', () => {
    process.env.AWS_ACCESS_KEY_ID = 'ENVKEY';
    process.env.AWS_SECRET_ACCESS_KEY = 'ENVSECRET';
    process.env.AWS_REGION = 'us-west-2';

    const ses = new SESAdapter();
    const client = ses._buildClient();
    assert.ok(client);

    // Cleanup
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_REGION;
  });

  it('_buildClient picks up changed credentials without restart', async () => {
    db.setSetting('aws_access_key_id', encryptSetting('KEY1'));
    db.setSetting('aws_secret_access_key', encryptSetting('SECRET1'));
    db.setSetting('aws_region', 'ap-southeast-3');

    const ses = new SESAdapter();
    const client1 = ses._buildClient();
    assert.equal(await client1.config.region(), 'ap-southeast-3');

    // Change credentials
    db.setSetting('aws_region', 'us-east-1');
    const client2 = ses._buildClient();
    assert.equal(await client2.config.region(), 'us-east-1');
  });
});
