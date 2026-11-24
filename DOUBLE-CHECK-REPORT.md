# EduAxis Netlify package — verification report

**Package:** EduAxis Tutor Centre Netlify Website & Parent Portal  
**Version:** 2.0.0  
**Prepared:** 20 November 2026

## Checks completed in this build environment

- `node --check server.js` — passed.
- `node --check public/app.js` — passed.
- `node --check netlify/functions/api.mjs` — passed.
- `npm test` — passed: 1 integration test suite, 1 test, 0 failures.
- The existing local SQLite integration test covers health, public forms, registration/login, administrator bootstrap/login, learner linking, parent portal access, homework/timetable writes, cross-family isolation, admin route restrictions and CSRF rejection.
- Netlify configuration, function source, PostgreSQL schema, Windows deploy helper and setup instructions are included.
- API SQL statements use parameterized values; parent portal learner queries are scoped to the authenticated parent ID.
- The hosted API uses a persistent PostgreSQL rate-limit table rather than relying solely on per-instance memory.
- No secrets or real learner records are embedded in the ZIP.

## Not verified from this environment

- Netlify deployment and live function invocation (requires the user's Netlify account and authorization).
- Neon database connection, schema execution and hosted database credentials (requires the user's Neon account).
- Real production login/forms on the deployed domain.
- Migration of existing SQLite records (not performed; hosted PostgreSQL starts empty).
- Database backup/restore, account MFA, penetration testing, POPIA legal review and production load testing.
- Original EduAxis logo and approved tutor/classroom photography were not present in the inspected build assets; placeholder identity artwork remains until the client supplies the originals.

## Release status

**Ready for controlled Netlify staging deployment**, once the Neon schema is installed and the three required environment variables are configured. Not represented as production-certified, POPIA-certified or fully live-tested. Do not enter real learner records until staging checks, access controls, backups and the centre's privacy/legal review are complete.
