# Deployment guide

The production app is **one Node process**. It serves the JSON API under `/api`, public media under `/media`, and the built React site for every other path, all from a single origin. You need:

1. a **PostgreSQL** database (managed: Neon, Supabase, Render, Railway, RDS, DigitalOcean…)
2. an **S3-compatible bucket** for photos and videos. Local disk is refused in production because most hosts wipe it on every deploy.
3. a host that runs Node 20+ behind **HTTPS** (Render, Railway, Fly.io, a VPS with Nginx/Caddy…)
4. optionally, an **SMTP** account (Brevo, Postmark, SES, Zoho, Gmail SMTP…)

## 1. Create the bucket

Use any S3-compatible service. For Cloudflare R2:

1. Create a bucket, e.g. `svss-media`.
2. Create an API token with **Object Read & Write** on that bucket.
3. Set these variables:
   - `S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`
   - `S3_REGION=auto`
   - `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
4. The bucket can stay **private**. Public images are streamed through `/media/...` with long-lived immutable cache headers, and enquiry reference photos are only served to their owner or an admin.
5. Optional: to serve public images straight from a CDN, make the `public/` prefix publicly readable, set `S3_PUBLIC_BASE_URL` (e.g. `https://media.yourdomain.com`), and keep `private/` non-public.

For AWS S3, leave `S3_ENDPOINT` empty and set `S3_REGION` (e.g. `ap-south-1`). For MinIO, also set `S3_FORCE_PATH_STYLE=true`.

## 2. Environment variables

Copy `.env.example`. These are the minimum for production:

```
NODE_ENV=production
PORT=4000                       # or whatever your host provides
APP_ORIGIN=https://www.yourdomain.com
TRUST_PROXY=1                   # behind a load balancer / reverse proxy
DATABASE_URL=postgresql://...   # use sslmode=require if your provider needs it
SESSION_SECRET=<64 random hex chars>
STORAGE_DRIVER=s3
S3_BUCKET=... S3_REGION=... S3_ENDPOINT=... S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=...
# optional email
SMTP_HOST=... SMTP_PORT=587 SMTP_USER=... SMTP_PASS=... SMTP_FROM="SVSS Boutique <hello@yourdomain.com>"
ADMIN_NOTIFY_EMAIL=owner@yourdomain.com
```

Generate the secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The server validates its configuration at boot and exits with a clear message (variable names only, never values) if anything required is missing.

## 3. Build and release

```bash
npm ci                     # installs dev deps too (needed for prisma CLI, tsc, vite, tsx)
npm run build              # prisma generate + server tsc + web vite build
npm run db:deploy          # apply migrations (run on every release, before start)
npm run db:seed            # first deploy only (idempotent; safe to re-run)
npm start
```

Create the admin **once**, from a shell on the server or your host's one-off job runner:

```bash
ADMIN_NAME="Owner" ADMIN_EMAIL=owner@yourdomain.com ADMIN_PASSWORD='long-unique-passphrase' npm run create-admin
```

### Render / Railway example

- **Build command:** `npm ci && npm run build`
- **Pre-deploy / release command:** `npm run db:deploy`
- **Start command:** `npm start`
- **Health check path:** `/healthz`

### VPS (Nginx) example

Run `npm start` under systemd or pm2, then proxy to it:

```nginx
server {
  server_name www.yourdomain.com;
  client_max_body_size 160m;          # allow video uploads
  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
  listen 443 ssl;  # certbot / Caddy for TLS
}
```

Set `TRUST_PROXY=1` so rate limiting sees real client IPs.

## 4. Launch checklist

- [ ] HTTPS works and `APP_ORIGIN` exactly matches the site URL (scheme + host). It is used for CSRF origin checks and email links.
- [ ] Admin can sign in at `/admin/login`.
- [ ] Upload a photo in Admin → Recent Work, publish it, then **restart the app** and confirm the photo still loads. This proves persistent storage works.
- [ ] Settings: real phone, email, address, hours, social links.
- [ ] Appointments → Hours & settings: working hours, slot length and timezone (default `Asia/Kolkata`).
- [ ] Book a test appointment as a customer, confirm it as admin, then cancel it.
- [ ] If SMTP is set: "Forgot password" delivers an email.
- [ ] Database backups are enabled (see BACKUP-RECOVERY.md).

## 5. Scaling notes

- The public-content cache and the rate limiter are **in-process**.
  - With several instances, a change is visible instantly on the instance that made it and within 30 s on the others.
  - Rate limits apply per instance.
  - For multi-instance setups, swap both for Redis.
- Double-booking protection lives in PostgreSQL (advisory lock + partial unique index), so it is safe across instances.
- Video uploads are held in memory while being stored (up to 150 MB each). Size the instance accordingly, or lower `uploads.maxVideoBytes` in `server/src/config.ts`.

## 6. Database migrations in future

Create migrations in development with `npm run db:migrate`, commit them, and run `npm run db:deploy` on release.

The double-booking guard is a hand-written partial unique index in the first migration. Prisma does not manage it and won't drop it, but check new migration SQL before committing it.
