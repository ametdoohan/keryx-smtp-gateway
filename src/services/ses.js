const { SESClient, SendRawEmailCommand } = require('@aws-sdk/client-ses');
const config = require('../config');
const db = require('../db');
const { decryptSetting } = require('./secure-settings');

class SESAdapter {
  constructor() {
    const region = db.getSetting('aws_region', config.sesRegion);
    const accessKeyId = decryptSetting(db.getSetting('aws_access_key_id', process.env.AWS_ACCESS_KEY_ID || ''));
    const secretAccessKey = decryptSetting(db.getSetting('aws_secret_access_key', process.env.AWS_SECRET_ACCESS_KEY || ''));
    const sesConfig = { region };

    if (accessKeyId && secretAccessKey) {
      sesConfig.credentials = { accessKeyId, secretAccessKey };
    }

    this.client = new SESClient(sesConfig);
  }

  async sendRaw(raw) {
    if (config.sesDryRun) return { messageId: `dryrun-${Date.now()}` };
    const out = await this.client.send(new SendRawEmailCommand({ RawMessage: { Data: raw } }));
    return { messageId: out.MessageId };
  }
}

module.exports = SESAdapter;
