# EduAxis Tutor Centre — Netlify Website & Parent Portal

**Version:** 2.0.0  
**Prepared for:** EduAxis Tutor Centre, Villieria, Pretoria

This package retains the existing independent EduAxis website and portal interface and adds a Netlify serverless API backed by hosted PostgreSQL. It contains no Base44 runtime SDK, API calls or hosted Base44 dependencies.

## Choose the deployment mode

- **Netlify production:** `public/` is the published website; `netlify/functions/api.mjs` handles `/api/*`; Neon PostgreSQL stores persistent records. Use the supplied `NETLIFY-SETUP-START-HERE.txt` and `DEPLOY-TO-NETLIFY-WINDOWS.bat`.
- **Local Windows testing:** the original `server.js` and SQLite workflow are retained. Use `QUICK-START-WINDOWS.txt`.

## Netlify architecture

| Component | Technology | Purpose |
|---|---|---|
| Website | Netlify static hosting | Public EduAxis website and PWA assets |
| API | Netlify Functions (Node.js) | Enquiries, applications, bookings, login, parent portal and admin endpoints |
| Database | Neon PostgreSQL | Persistent users, sessions, learner and centre records |
| Routing | `netlify.toml` | Rewrites `/api/*` to the API function |

The Netlify version does not use SQLite or local filesystem storage. This is intentional: serverless function filesystems are not a persistent database. The local SQLite database is retained for local use but is not automatically imported into Neon.

## Included features

- Responsive marketing website with Home, About, Learning Approach, Grades 1–12 & Curriculum, Services, Meet Tutor, Parent Information, Enrolment, Consultation Booking, Resources, News, Gallery, Testimonials, Parent Portal and Contact sections.
- Public enquiry, initial application and consultation request forms.
- Parent registration and password login using salted Node.js `scrypt` hashes.
- HttpOnly, Secure, SameSite session cookies; hashed session tokens; CSRF checks for authenticated writes.
- Parent portal with database-enforced family relationship queries.
- Admin dashboard for submitted enquiries/applications/bookings, learner linking, homework, progress, timetable, notices, news, resources, gallery and testimonials.
- Persisted PostgreSQL rate-limit counters across function instances.
- Netlify security headers, route rewrites, SQL schema and Windows deploy helper.

## Netlify setup

Follow **`NETLIFY-SETUP-START-HERE.txt`**. In short:

1. Create a Neon PostgreSQL database.
2. Run `database/schema.sql` in the Neon SQL Editor.
3. Add `DATABASE_URL`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` to Netlify environment variables.
4. Extract this ZIP on Windows and run `DEPLOY-TO-NETLIFY-WINDOWS.bat`.
5. On first run, authorize Netlify and link the existing EduAxis site when prompted.
6. Test `/api/health`, admin login and a test parent/learner workflow.

**For the complete website and Parent Portal, deploy using the included `DEPLOY-TO-NETLIFY-WINDOWS.bat` script or connect this folder to a Git-based Netlify build.** A drag-and-drop upload of `public/` publishes only the static marketing site; it does not build/deploy the `/api/*` serverless functions or activate database-backed forms and the Parent Portal.

### Administrator bootstrap

The API creates the administrator account on its first request using `ADMIN_EMAIL` and `ADMIN_PASSWORD`. Use an email address that is not already registered as a parent. The password must be at least 14 characters. The bootstrap is create-only: changing the environment variable later does not overwrite the existing admin password.

## Local Windows mode

Requires Node.js 22.13 or later for the built-in `node:sqlite` module. Follow `QUICK-START-WINDOWS.txt`. Local records are stored in `data/eduaxis.sqlite` and are separate from the hosted PostgreSQL database.

## Before collecting real learner data

- The supplied original EduAxis logo is now installed in the header, footer and favicon. The hero and gallery use bundled illustrative learning images; these are not photographs of the actual centre or identifiable EduAxis learners. Replace them with centre-approved photographs if/when the client supplies them.
- Review privacy notices, consent, retention periods and operator agreements for POPIA compliance with the centre's adviser.
- Enable MFA on hosting/database accounts and limit team access.
- Configure and test database backup and restore.
- Perform an independent security review and staging acceptance test.
- Confirm the database region, access controls and contractual safeguards are appropriate for the centre's learner data.

## Not included / not represented as complete

- Automatic migration of existing SQLite records into PostgreSQL.
- Email, SMS or WhatsApp notifications.
- Payment gateway processing.
- File uploads or persistent media storage.
- MFA inside the parent portal, full immutable audit logging, formal penetration testing or production load certification.
- The client's original logo and approved real photographs.

This is a deployable staging implementation, not a claim of POPIA certification or production security certification. The centre should complete the listed checks before entering sensitive learner information.
