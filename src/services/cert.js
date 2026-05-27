const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function ensureCert(certPath, keyPath) {
  fs.mkdirSync(path.dirname(certPath), { recursive: true });
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return;
  }

  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '365',
    '-subj', '/CN=localhost', '-keyout', keyPath, '-out', certPath,
  ], { stdio: 'ignore' });
}

module.exports = { ensureCert };
