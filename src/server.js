const fs = require('fs');
const config = require('./config');
const db = require('./db');
const app = require('./web');
const SESAdapter = require('./services/ses');
const { createServer } = require('./services/smtp');
const { ensureCert } = require('./services/cert');

async function start() {
  db.seedAdmin();
  const mode = db.getSetting('smtp_mode', config.smtpMode);
  const host = db.getSetting('smtp_host', config.smtpHost);
  const port = Number(db.getSetting('smtp_port', config.smtpPort));

  ensureCert(config.certPath, config.keyPath);
  const tls = { cert: fs.readFileSync(config.certPath), key: fs.readFileSync(config.keyPath) };

  const smtp = createServer({ mode, host, port, tls, ses: new SESAdapter() });
  await smtp.start();

  app.listen(config.appPort, () => {
    // eslint-disable-next-line no-console
    console.log(`Web admin running on http://localhost:${config.appPort}`);
    // eslint-disable-next-line no-console
    console.log(`SMTP gateway running ${mode} on ${host}:${port}`);
  });
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
