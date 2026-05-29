# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] — 2026-05-29

### Added

- **Role-based access control (RBAC)** — Three roles with distinct permissions:
  - `superadmin` — Full access: manage SMTP/AWS settings, create/delete/toggle all users, view all reports
  - `admin` — Manage users (create user/admin, toggle status), view read-only settings, view all reports
  - `user` — SMTP send only, view own reports (filtered by user_id)
- **User management actions** — Toggle active/inactive status (admin+), delete users (superadmin only), with role hierarchy enforcement
- **403 Forbidden page** — Styled access-denied page shown when a user tries to access a restricted route
- **SMTP domain enforcement** — Two layers of protection:
  - Per-user `allowed_sender_domain`: restricts which FROM domain a user can send as (checked in `onMailFrom`)
  - Per-user `allowed_recipient_domain`: restricts which TO domains a user can send to (checked in `onRcptTo`)
  - Global `allowed_recipient_domains` setting: fallback restriction when per-user recipient domain is empty. Leave empty to allow all recipients.
- **Flash messages** — Admin dashboard now shows a green success banner after saving settings or creating a user, confirming the action was applied.
- **Configurable timezone** — Display timezone for report timestamps, configurable in admin settings (defaults to `Asia/Jakarta`). Stored timestamps remain UTC; conversion happens at display time.
- **SMTP error resilience** — TLS handshake errors (e.g. plain telnet to SMTPS port) no longer crash the server; they are logged and the server continues.
- **Unit test suite** — 24 tests using Node.js built-in test runner covering secure-settings encryption, database CRUD, user management, and web route auth.
- **SMTP auth debug logging** — Auth attempts are logged to stdout with username and method for troubleshooting.
- **Logout** — POST `/logout` route that destroys the session and redirects to login. A logout icon button is shown in the navigation bar next to the username.
- **Dark mode support** — Toggle between light and dark themes via a button in the navigation bar (sun/moon icon). Preference is persisted in `localStorage` and respects the system `prefers-color-scheme` on first visit.
- **Modern UI refactor** — Replaced bare HTML views with a polished, responsive design using Tailwind CSS (CDN). Includes shared layout partials (`head.ejs`, `nav.ejs`, `footer.ejs`), card-based sections, status badges, summary stat cards, and an empty-state illustration.
- Dark-aware component classes (`.card`, `.input`, `.label`, `.btn-primary`, `.btn-secondary`) defined in a shared `<style>` block for consistency.
- Accessible form labels, autocomplete hints, and ARIA attributes on interactive elements.
