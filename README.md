# keryx-smtp-gateway

Keryx SMTP Gateway is an SMTP wrapper for AWS SES API. It allows SMTP-based applications to deliver mail via AWS SES.

## Features (MVP)

- SMTP gateway modes: `smtp`, `smtps`, `starttls`
- Admin dashboard for SMTP settings and user management
- Reporting dashboard with status filter and CSV export
- SQLite persistence for users, settings, and message logs
- Development TLS certificate auto-generation (self-signed fallback)

## Quick Start

```bash
cd /tmp/workspace/ametdoohan/keryx-smtp-gateway
npm install
npm run start
```

- Web admin: `http://localhost:3000`
- Default admin:
  - username: `admin`
  - password: `admin123`

## Environment Variables

- `APP_PORT` (default: `3000`)
- `SESSION_SECRET` (default: `change-me`)
- `SQLITE_PATH` (default: `data/gateway.db`)
- `SMTP_MODE` (default: `smtps`)
- `SMTP_HOST` (default: `0.0.0.0`)
- `SMTP_PORT` (default: `2465`)
- `SMTP_CERT_PATH` (default: `certs/smtp.crt`)
- `SMTP_KEY_PATH` (default: `certs/smtp.key`)
- `SES_DRY_RUN` (default: `true`)
- `AWS_REGION` (default: `us-east-1`)

## Notes

- SMTP settings updated in web admin are stored in SQLite and applied on next service restart.
- In development, a self-signed certificate is generated automatically if certificate files do not exist.
- For production, configure real TLS certificates and disable SES dry-run mode.

## Validation

```bash
npm test
```
