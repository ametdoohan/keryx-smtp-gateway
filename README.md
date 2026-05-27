# keryx-smtp-gateway

Keryx SMTP Gateway is an SMTP wrapper for AWS SES API.  
It is designed to let existing SMTP-based applications deliver email through AWS SES without changing their email client integration.

## Goals

- Provide SMTP-compatible access to AWS SES.
- Support SMTP protocol modes:
  - SMTP
  - SMTPS
  - STARTTLS
- Provide a web admin panel for user and protocol management.
- Provide reporting and audit visibility for email traffic.
- Support automatic TLS certificate provisioning for SMTPS.

## Planned Features

### 1) SMTP Gateway Core
- SMTP listener with configurable mode (SMTP / SMTPS / STARTTLS)
- Authentication layer for SMTP users
- User quota controls (daily/monthly)
- Sender policy controls (allowed sender domain/address)
- SES adapter using AWS SES API

### 2) Admin Dashboard
- User management (create, edit, disable, reset password)
- SMTP protocol configuration (mode/host/port)
- Gateway status visibility
- Role model (superadmin/admin)

### 3) Reporting Dashboard
- Delivery metrics (sent/failed)
- Latency insights
- Filter by status and date range
- CSV export
- Audit activity logs

### 4) TLS Certificate Management
- Existing certificate loading
- Auto-generated certificate for development fallback
- ACME integration hooks for production automation

## Architecture (High Level)

1. SMTP client authenticates to gateway.
2. Gateway validates user, policy, and quota.
3. Message is forwarded to AWS SES API.
4. Delivery attempt is logged for reporting and auditing.
5. Admin dashboard manages users and SMTP settings.

## Database

SQLite is the default database option for persistence:
- User credentials and roles
- SMTP settings
- Message logs
- Audit logs

## Security Notes

- Use strong password hashing (bcrypt/Argon2).
- Enforce TLS for credential exchange in production.
- Apply login/auth rate limiting and IP throttling.
- Keep AWS credentials in environment variables or a secret manager.

## Current Status

This repository is currently focused on project direction and documentation.  
Implementation can proceed incrementally from an MVP:

1. SMTP auth + SES relay + basic admin user management
2. Full reporting with bounce/complaint ingestion
3. HA, observability, and advanced multi-tenant controls

## Branch Workflow

Requested working branch for this task: `copilot/development`.