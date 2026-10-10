# SVSS Boutique

**Custom Designing · Maggam · Embroidery · Stitching**

This is the full-stack website for SVSS Boutique. It has three parts:

- a public showcase site with a lightweight 3D hero
- a customer account area for appointments, enquiries, favourites and notifications
- an admin CMS, so the owner can manage all content without code changes

> **Not an online shop.** There is deliberately no cart, checkout, payment, order tracking or order model anywhere in the code or database.

| Layer | Tech |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS 4, Framer Motion, Three.js via React Three Fiber, TanStack Query, React Router 7 |
| Backend | Node 20+ (tested on 22), Express 5, Prisma 6, PostgreSQL (tested on 18), zod validation |
| Media | S3-compatible object storage in production (AWS S3, Cloudflare R2, Backblaze B2, DigitalOcean Spaces, MinIO); local disk in development only |
| Email | Optional SMTP (nodemailer). Without it, all communication stays in-app |

### Why this stack

The site is a content-and-booking app with relational data and strict access rules, not a shop. The choices follow from that.

**Frontend**
- **React + TypeScript + Vite**: a mainstream, well-supported base. Types catch mistakes across the three areas (public, customer, admin) that share one codebase, and Vite keeps builds fast.
- **React Three Fiber**: the 3D hero is written as an ordinary React component rather than a separate Three.js setup.
- **Tailwind CSS + Framer Motion**: consistent styling and smooth animation for a premium look without a heavy UI framework.
- **TanStack Query**: keeps client data fresh. It works alongside the server's cache clearing and ETags, so admin edits show up on the next page load.
- **React Router**: one SPA with three route trees is simpler to build and deploy than three separate apps.

**Backend**
- **Express on Node**: one language across the stack. In production a single process serves the API and the built SPA on one origin, which keeps session cookies, CSRF protection and the strict CSP simple.
- **PostgreSQL**: booking needs real transactions, advisory locks and partial unique indexes to prevent double booking (see [Security summary](#4-security-summary)). The data (users, appointments, enquiries, private notes, media) is relational.
- **Prisma**: type-safe, parameterised queries that share types with the code, plus versioned migrations that are safe to apply in production.
- **zod**: validates every input on the server, because the server never trusts IDs, roles or statuses sent by the browser.

**Media and email**
- **S3-compatible storage**: most hosts wipe local disk on redeploy, so uploads need persistent storage. Using the S3 API avoids lock-in to a single provider.
- **Optional SMTP**: a small business may never configure email, so every flow also works in-app.

**Trade-off**: this takes more setup than a hosted site builder or a managed backend (for example, Next.js with Supabase). In return it gives full control over booking rules, private enquiry data and permissions, and an admin panel built around how the owner works.

```
.
├── server/                 Express API + Prisma
│   ├── prisma/             schema.prisma, migrations/, seed.ts
│   ├── src/
│   │   ├── routes/         auth, public, me (customer), enquiries, appointments, admin/*
│   │   ├── lib/            storage (local/S3), media processing, slots engine, settings, cache, mail
│   │   └── middleware/     sessions/RBAC, CSRF, rate limiting
│   ├── scripts/            create-admin, cleanup-media, e2e-reset
│   └── tests/              API permission & business-rule tests (vitest + supertest)
├── web/                    React SPA
│   ├── src/pages/          public/, customer/, admin/
│   ├── src/components/     UI kit, layouts, Hero + HeroScene (3D), forms, media uploader
│   └── e2e/                Playwright end-to-end tests
├── brand/                  original logo file supplied by the owner
├── docs/                   DEPLOYMENT.md, BACKUP-RECOVERY.md
└── scripts/dev-db.sh       optional private Postgres for local development
```

---

## 1. Local development

**Quick start:** `./run.sh` does everything below automatically (install, `.env`, local database, migrations, seed, first-admin prompt, start). Other options: `./run.sh prod`, `./run.sh test`, `./run.sh stop`.

### Requirements
- Node.js 20+ and npm 9+
- PostgreSQL 14+ (any local install, Docker, or the helper below)

### Steps

```bash
npm install                      # installs server + web (npm workspaces)
cp .env.example .env             # then edit DATABASE_URL and SESSION_SECRET
```

**Database.** Point `DATABASE_URL` at any PostgreSQL database you own. If you have the PostgreSQL server binaries but no credentials for the system cluster, `npm run db:dev:init` creates a private cluster in `./.dev/pgdata` on port 5434 (user `svss`, trust auth on 127.0.0.1 only). Start it again later with `npm run db:dev:start`. The matching URL is:

```
DATABASE_URL=postgresql://svss@127.0.0.1:5434/svss?schema=public
```

```bash
npm run db:deploy                # apply migrations
npm run db:seed                  # 4 core services, default categories, default settings
ADMIN_NAME="Owner" ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-passphrase' npm run create-admin
npm run dev                      # API on :4000, site on http://localhost:5173
```

- Admin sign-in: **http://localhost:5173/admin/login**
- Customers register at `/register`. Browsing never requires an account.

### First admin

Public registration **cannot** create admins. The only way to create one is the command line:

```bash
ADMIN_NAME="Owner Name" ADMIN_EMAIL=owner@yourdomain.com ADMIN_PASSWORD='at-least-12-characters' npm run create-admin
```

- Running it again with an existing email promotes that account to admin, resets its password, and signs out its existing sessions.
- Afterwards, remove `ADMIN_PASSWORD` from your shell history or environment.

### What the seed creates (and what it doesn't)

The seed only creates:
- the four core services (Custom Designing, Maggam Work, Embroidery, Stitching), with **no prices, durations or policies**
- the nine default Recent Work categories
- default homepage copy from the brief

The homepage, service cards and story section use the approved mock-up's photographs (`web/public/decor/`) **only as decorative defaults** until the owner uploads their own images in Admin → Homepage / Services. They are never presented as portfolio work.

It never invents an address, phone number, working hours, testimonials, social links or portfolio items. It is idempotent and never overwrites edits. The owner fills in everything else from the admin panel:

1. **Settings**: phone, email, address, opening hours, map, social links
2. **Appointments → Hours & settings**: working hours, slot length, holidays. Online booking stays closed until hours exist.
3. **Recent Work → Add new work**: upload photos, then publish
4. **Homepage**: hero text and image, section visibility, about text, then preview and publish
5. **Services, Collections, Categories**: images, ordering, publishing

---

## 2. Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | API (tsx watch) + Vite dev server |
| `npm run build` | `prisma generate`, compile server, then type-check and build the SPA into `web/dist` |
| `npm start` | Production server: serves the API **and** the built SPA on one origin (`PORT`, default 4000) |
| `npm run db:deploy` | Apply pending migrations (safe for production) |
| `npm run db:migrate` | Create a new migration in development (`prisma migrate dev`) |
| `npm run db:seed` | Idempotent safe seed |
| `npm run create-admin` | Create or promote the admin (see above) |
| `npm test` | API tests against the `*_test` DB in `.env.test` (runs `migrate deploy`, truncates only `*_test` databases) |
| `npm run test:e2e` | Playwright end-to-end tests. Starts an isolated API on :4200 with the `*_e2e` DB from `.env.e2e` and Vite on :5174. Uses installed Google Chrome. |
| `npm run typecheck` | Type-check server and web |
| `npm run media:cleanup` | Delete uploads that were never attached to anything (older than 24 h). This also runs every 6 h in the server. |

For tests, create `.env.test` and `.env.e2e` like `.env`, with database names ending in `_test` and `_e2e`. The test helpers refuse to wipe any other database.

---

## 3. How content publishing works

1. In **Admin → Recent Work → Add new work**, the admin enters a title and description and picks a category.
2. They upload a cover, gallery photos, an optional video and optional before/after photos. Uploads show live progress bars.
3. The server checks every file's real bytes, not its extension. Images are re-encoded to WebP, which strips EXIF/GPS data, fixes orientation and creates a thumbnail. Files go to persistent storage (S3 in production) and are recorded as `MediaAsset` rows.
4. **Preview** shows the exact public page. **Save draft** keeps it private; **Publish** makes it live.
5. The server validates again: a valid category is required, a cover is required to publish, and files can't be reused across items. Writes happen in a transaction and are logged in the activity log.
6. Every admin write clears the public API cache. Public responses send `Cache-Control: no-cache` with ETags, so visitors see changes on their next page load. No redeploy is needed.
7. Unpublishing removes the item from every public endpoint immediately. Customers who saved it see it as "no longer on display".

Drafts are never returned by public endpoints. This is enforced in the queries and covered by tests.

---

## 4. Security summary

- **Passwords** are hashed with scrypt (N=2¹⁵, r=8, p=1, per-user salt). Unknown-email logins take the same time as wrong-password logins.
- **Sessions** use an opaque random token in an `HttpOnly`, `SameSite=Lax` cookie. In production the cookie is `Secure` with a `__Host-` prefix. Only a SHA-256 hash of the token is stored. Customer sessions last 30 days; admin sessions last 12 hours. Disabling an account or resetting a password revokes its sessions.
- **RBAC** is enforced on the server. `/api/admin/*` requires an ADMIN session, and `/api/me/*` requires a CUSTOMER session. Every customer query is scoped by the session's user ID; the server never trusts a user ID, role or status sent by the browser. Another customer's appointment, enquiry or attachment returns **404**.
- **Admin login** is separate (`/admin/login`, `/api/auth/admin/login`). Admins can't sign in through the customer form.
- **CSRF** protection uses a signed double-submit token (`X-CSRF-Token` header must match an HMAC-signed cookie) and an Origin check on every state-changing request.
- **Rate limits**:
  - admin login: 5 attempts per 15 minutes
  - customer login: 10 per 15 minutes
  - register and password reset: 10 per hour
  - public enquiry and booking forms: 15 per hour
  - whole API: 300 per minute
- **Spam protection** on guest forms: a honeypot field plus a minimum fill time.
- **Validation and sanitisation** use zod on every input, with length caps and control characters stripped. Output is rendered as text, never HTML. Prisma parameterises every query, so SQL injection isn't possible.
- **Uploads** are type-checked by magic bytes, size-limited (images 15 MB, videos 150 MB, enquiry references 8 MB × 4) and re-encoded. Enquiry reference images are **private**: stored under `private/`, only reachable through an endpoint that checks the owner or an admin, and never served by `/media`.
- **Internal notes** live in a separate `EnquiryNote` table and are never selected by customer endpoints. Appointment `adminNotes` are likewise excluded. Both are covered by tests.
- **Security headers** come from helmet: a strict CSP (`script-src 'self'`), HSTS in production, `frame-ancestors 'none'`, `nosniff` and a referrer policy.
- **Errors** shown to users are friendly. Internals are logged on the server, never returned to the browser.
- **Secrets** live only in environment variables. `.env*` files are git-ignored, and the server prints variable *names* (never values) on a config error.
- **Double booking** is prevented three ways:
  1. a PostgreSQL advisory lock serialises booking writes
  2. availability is re-checked inside the transaction
  3. a partial unique index on `Appointment(startAt) WHERE status IN ('PENDING','CONFIRMED')` backs everything up (it's in the init migration)

---

## 5. External services and credentials

| Service | Needed for | Required? | Env vars |
| --- | --- | --- | --- |
| PostgreSQL | All data | **Yes** | `DATABASE_URL` |
| S3-compatible storage | Persistent photos and videos | **Yes in production** (the server refuses to start without it) | `STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, optional `S3_PUBLIC_BASE_URL` |
| SMTP email | Password-reset emails, verification, notification emails | Optional | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `ADMIN_NOTIFY_EMAIL` |
| Google Maps embed | Map on the Contact page | Optional, no API key (paste the "Embed a map" link in Settings) | none |

**Without SMTP:**
- "Forgot password" honestly says that emails aren't enabled.
- The admin can generate a one-time reset link from **Admin → Customers** and share it.
- Customers see replies and status changes in their dashboard notifications.

---

## 6. What has and hasn't been verified

The following was run on the development machine:
- `npm test`: 38 API tests pass (auth, RBAC, cross-customer isolation, CSRF, rate limiting, uploads, publish/unpublish visibility, enquiries with private notes, appointment availability, concurrent double booking, status changes, reschedule)
- `npm run test:e2e`: 7 Playwright flows pass in Chrome (browsing, admin upload/publish/unpublish, booking hours, customer register → favourite → book → admin confirm → customer sees it, enquiry → admin reply → customer reads, admin-area blocking, mobile overflow and menu)
- the production build (`npm run build && npm start`) serves the SPA with the strict CSP

The following has **not** been verified:
- S3 storage (no bucket credentials were available) and SMTP email. Both code paths exist, but test them with your real credentials before launch (see `docs/DEPLOYMENT.md`).
- Any real deployment.

See **docs/DEPLOYMENT.md** and **docs/BACKUP-RECOVERY.md**.
