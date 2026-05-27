const { SESClient, SendRawEmailCommand } = require('@aws-sdk/client-ses');
const config = require('../config');

class SESAdapter {
  constructor() {
    this.client = new SESClient({ region: config.sesRegion });
  }

  async sendRaw(raw) {
    if (config.sesDryRun) return { messageId: `dryrun-${Date.now()}` };
    const out = await this.client.send(new SendRawEmailCommand({ RawMessage: { Data: raw } }));
    return { messageId: out.MessageId };
  }
}

module.exports = SESAdapter;
