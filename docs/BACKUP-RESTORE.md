# Database backups and restore tests

**Status (28 Nov 2026): this is a documented procedure plus a tested tool. No backup of the live
database has been taken or restored as part of this work.** Until someone runs section 3 and passes
section 5 against the real cluster, there is no verified backup.

## 1. What is stored where

- **Engine**: MongoDB Atlas, through the official Node driver (`mongodb` 6.x, `src/db.js`), database
  `kareiq` (production), `kareiq-staging`, `kareiq-demo`. Without `MONGODB_URI` (local development) the
  same records are JSON files in the data folder. Upstash Redis is also supported by the code.
- **Schema**: no schema or migration system. Records are documents with an `id` (Mongo `_id` = `id`).
  Indexes are created by the server at start (`ensureIndexes` in `src/docs.js`, safe to repeat), so a
  restored database gets them on its first start.
- **Main collections**: `bookings`, `enquiries`, `settings`, `history` (website content), and the app's
  `app_*` collections (users, sessions, people, plans, orders, payments, records, **files: uploaded
  medical documents stored base64 inside the database**, readings, risk, audit, schedule...).
  `app_sessions`, `app_order_locks`, `app_handoff` and `booking_keys` are short-lived and need not be restored.
- **Sensitive**: health records, documents, names, phone numbers and addresses. Treat every backup as
  health data (India's DPDP Act): encrypted, access-controlled, kept no longer than needed.

## 2. Built-in Atlas backups

Check the cluster tier first. Free (M0) clusters have **no automated backups**. Paid dedicated tiers
offer Cloud Backup with scheduled snapshots and point-in-time restore: turn it on, set the snapshot
schedule to match section 4, and restore into a **new** cluster for tests (section 5), never over the live one.

## 3. Taking a backup (read-only)

Use a dedicated Atlas user with the read-only `backup` role. Keep the connection string in an
environment variable; never type it into a command that is logged or shared.

**Option A, MongoDB Database Tools** (install them on the machine that takes the backup):
```bash
mongodump --uri="$BACKUP_MONGODB_URI" --db=kareiq --archive="kareiq-$(date +%F).archive.gz" --gzip
mongorestore --dryRun --archive="kareiq-$(date +%F).archive.gz" --gzip   # reads it back without writing
```

**Option B, the project tool** (no extra installs; writes one Extended-JSON file per collection, plus a manifest with SHA-256 checksums and record counts):
```bash
MONGODB_URI="$BACKUP_MONGODB_URI" MONGODB_DB=kareiq \
  node tools/db-backup.js backup --out ./backups/kareiq-2026-11-28 --allow-production-source
node tools/db-backup.js verify ./backups/kareiq-2026-11-28
```
The tool only reads the source, refuses a non-empty output folder, and needs `--allow-production-source` before it reads production.
For a local data folder: `DATA_DIR=./data node tools/db-backup.js backup --out ./backups/local-copy`.

**Then, every time**:
1. Encrypt the archive or folder before it leaves the machine (for example `age` or `gpg` with a key held by two named people), and delete the unencrypted copy.
2. Store it outside Render and Atlas (a separate account or provider), with access limited to the people who may restore.
3. Record the date, size, record counts (manifest) and who took it.

## 4. Retention (suggested; the owner decides)

Daily backups kept 7 days, weekly kept 4 weeks, monthly kept 12 months. Delete older copies on
schedule. When a person's data must be erased, it remains only in backups until they expire: note
this in the privacy policy and never restore it into production without re-applying the erasure.

## 5. Restore test (separate database only)

The tool refuses to restore into production: it refuses `APP_ENV=production`, the live database name
`kareiq` (and names containing "prod"), the database the server itself is configured with, and any
target that already holds data.

1. Create an empty test database on a separate cluster (or at least a separate database name such as `kareiq-restore-test`).
2. Restore:
   ```bash
   TARGET_MONGODB_URI="$TEST_MONGODB_URI" node tools/db-backup.js restore ./backups/kareiq-2026-11-28 --target-db kareiq-restore-test
   # or: mongorestore --uri="$TEST_MONGODB_URI" --nsFrom='kareiq.*' --nsTo='kareiq-restore-test.*' --archive=... --gzip
   ```
3. Compare record counts with the backup's manifest.
4. Start the app against it as staging and check it works:
   ```bash
   APP_ENV=staging MONGODB_URI="$TEST_MONGODB_URI" MONGODB_DB=kareiq-restore-test SESSION_SECRET=$(openssl rand -hex 24) PORT=3300 node server.js
   ```
   Sign in with an office account, open a customer, a document and an order.
5. Delete the test database afterwards (it holds real health data).
6. Write down the date and result. A backup counts as verified only after this.

A local, file-mode version of this whole cycle runs with `npm run check:backup` (`node tools/db-backup.js selftest`, temporary folders only).

## 6. Rolling back a bad deployment

- **Code**: redeploy the previous commit on Render ("Manual Deploy", choose the commit). No schema migrations exist, so older code reads the same records.
- **Data**: restore only after a test restore (section 5) shows the backup is good, into a new database; switch `MONGODB_DB` to it during a maintenance window, and keep the old database until the switch is confirmed.
