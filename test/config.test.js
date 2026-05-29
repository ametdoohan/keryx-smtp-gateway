const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('Config', () => {
  it('should load default values', () => {
    // Clear env vars that might override
    const saved = { ...process.env };
    delete process.env.APP_PORT;
    delete process.env.SMTP_MODE;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.AWS_REGION;
    delete process.env.SES_DRY_RUN;
    delete process.env.TZ_DISPLAY;

    // Re-require config fresh
    delete require.cache[require.resolve('../src/config')];
    const config = require('../src/config');

    assert.equal(config.appPort, 3000);
    assert.equal(config.smtpMode, 'smtps');
    assert.equal(config.smtpHost, '0.0.0.0');
    assert.equal(config.smtpPort, 2465);
    assert.equal(config.sesRegion, 'us-east-1');
    assert.equal(config.sesDryRun, true);
    assert.equal(config.timezone, 'Asia/Jakarta');

    // Restore
    Object.assign(process.env, saved);
  });

  it('should respect env var overrides', () => {
    process.env.APP_PORT = '4000';
    process.env.SMTP_MODE = 'starttls';
    process.env.SMTP_PORT = '587';
    process.env.AWS_REGION = 'ap-southeast-3';
    process.env.SES_DRY_RUN = 'false';
    process.env.TZ_DISPLAY = 'UTC';

    delete require.cache[require.resolve('../src/config')];
    const config = require('../src/config');

    assert.equal(config.appPort, 4000);
    assert.equal(config.smtpMode, 'starttls');
    assert.equal(config.smtpPort, 587);
    assert.equal(config.sesRegion, 'ap-southeast-3');
    assert.equal(config.sesDryRun, false);
    assert.equal(config.timezone, 'UTC');

    // Cleanup
    delete process.env.APP_PORT;
    delete process.env.SMTP_MODE;
    delete process.env.SMTP_PORT;
    delete process.env.AWS_REGION;
    delete process.env.SES_DRY_RUN;
    delete process.env.TZ_DISPLAY;
  });
});
