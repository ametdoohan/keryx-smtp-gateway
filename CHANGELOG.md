# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- **Logout** — POST `/logout` route that destroys the session and redirects to login. A logout icon button is shown in the navigation bar next to the username.
- **Dark mode support** — Toggle between light and dark themes via a button in the navigation bar (sun/moon icon). Preference is persisted in `localStorage` and respects the system `prefers-color-scheme` on first visit.
- **Modern UI refactor** — Replaced bare HTML views with a polished, responsive design using Tailwind CSS (CDN). Includes shared layout partials (`head.ejs`, `nav.ejs`, `footer.ejs`), card-based sections, status badges, summary stat cards, and an empty-state illustration.
- Dark-aware component classes (`.card`, `.input`, `.label`, `.btn-primary`, `.btn-secondary`) defined in a shared `<style>` block for consistency.
- Accessible form labels, autocomplete hints, and ARIA attributes on interactive elements.
