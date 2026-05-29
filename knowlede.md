# Knowlede

This file summarizes knowledge gathered from previous sessions in this repository.

## Session Knowledge

1. **Build/Test Commands**
   - Start the project with: `npm run start`
   - Run tests with: `npm test`

2. **Admin Settings and AWS Credentials**
   - Admin settings include AWS region support.
   - AWS credentials are stored encrypted in SQLite.
   - Encryption uses `SETTINGS_ENCRYPTION_SECRET`.

3. **CI/CD Workflow**
   - CI/CD is defined in `.github/workflows/ci-cd.yml`.
   - Workflow includes test execution, `npm audit`, CodeQL, Trivy image scanning, and GHCR push on `main`.
