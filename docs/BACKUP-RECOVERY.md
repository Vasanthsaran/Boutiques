# Backups & recovery

Two things hold state:

1. **PostgreSQL**: users, content, appointments, enquiries, settings and the activity log
2. **The media bucket**: photos and videos. Rows in `MediaAsset` point to object keys in the bucket.

Back up **both**, on the same schedule.

## Database

**Managed providers** (Neon, Supabase, RDS, Render, Railway…):
- Turn on automated daily backups or point-in-time recovery (PITR) with at least 7 days' retention.
- Do a test restore into a new database once, so you know the steps work.

**Self-managed PostgreSQL:** take a nightly logical dump (example cron):

```bash
#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date +%F)
pg_dump --format=custom --no-owner "$DATABASE_URL" > /backups/svss-$STAMP.dump
find /backups -name 'svss-*.dump' -mtime +30 -delete      # keep 30 days
# copy off-site, e.g.: aws s3 cp /backups/svss-$STAMP.dump s3://svss-backups/db/
```

**Restore:**

```bash
createdb svss_restored
pg_restore --no-owner --dbname=postgresql://.../svss_restored /backups/svss-2026-10-09.dump
# then point DATABASE_URL at the restored DB and run:
npm run db:deploy        # applies any newer migrations
```

## Media bucket

- Enable **object versioning** on the bucket (S3, R2, B2 and MinIO all support it). Then a deleted or overwritten object can be restored.
- Optionally, replicate the bucket to a second bucket or region (S3 replication, `rclone sync`, R2 → B2).

```bash
rclone sync r2:svss-media b2:svss-media-backup --fast-list
```

- Object keys are unique per upload and never overwritten. If a nightly copy and a DB dump are taken at roughly the same time, they stay consistent.

## Recovery scenarios

| Problem | What to do |
| --- | --- |
| A design was deleted by mistake | Deletion is permanent in the app. Restore the DB to a scratch database from the latest backup, export the rows you need, and restore the objects from bucket versioning. Prefer **Unpublish** over delete in day-to-day use. |
| Bad content was published | Edit or unpublish in the admin. The Activity Log shows who changed what, and when. |
| The admin password is lost | On the server: `ADMIN_EMAIL=owner@… ADMIN_PASSWORD='new-passphrase' npm run create-admin`. This resets the password and signs out old sessions. |
| A customer can't reset their password and SMTP isn't configured | Admin → Customers → open the customer → **Create password reset link**, then send them the link (valid 24 h). |
| `SESSION_SECRET` leaked | Rotate it. Everyone's CSRF tokens refresh automatically. Also run `DELETE FROM "Session";` to sign everyone out. |
| Whole server lost | Provision a new host, set the same env vars, `npm ci && npm run build && npm run db:deploy && npm start`. Data lives in the DB and the bucket, so nothing is stored on the app server itself. |

## Housekeeping (automatic)

Every 6 hours the server:
- deletes expired sessions and old auth tokens
- deletes uploads that were never attached to anything within 24 h (e.g. an abandoned "Add new work" form)

You can run the cleanup by hand with `npm run media:cleanup`.
