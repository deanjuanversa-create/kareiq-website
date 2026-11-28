# Deploying KareIQ safely: production, staging and demo

This describes the configuration in the repository (28 Nov 2026). Nothing in it changes the hosting
services until someone applies it in the Render or Vercel dashboard.

## 1. What can deploy production today

| Path | Where | Effect |
|---|---|---|
| A push to `main` | Render `kareiq-api`, **if** auto-deploy is on in the dashboard | Rebuilds the live API, app, admin and database-backed forms. `render.yaml` now says `autoDeploy: false`, but the dashboard setting wins until the Blueprint is synced: check it (step 4). |
| A push to `main` | Render `kareiq-demo` (`autoDeploy: true`) | Rebuilds the demo only (its own database `kareiq-demo`). |
| A push to `main` | Vercel projects linked to this repository (Git integration) | Vercel deploys the production branch of every linked project automatically, unless switched off (step 4). These are the static websites. |
| "Manual Deploy" / "Redeploy" buttons, `vercel --prod` | Render / Vercel | Deploys immediately. |
| Syncing the Render Blueprint | Render | Applies `render.yaml`: creates `kareiq-staging` and sets `autoDeploy` and `APP_ENV` as below. |

## 2. Environments (`APP_ENV`, enforced by `src/runtime.js` at start)

| `APP_ENV` | Database | Refuses to start when |
|---|---|---|
| `production` | `MONGODB_DB=kareiq` (the live one) | no `MONGODB_URI` (and no confirmed persistent data folder), `APP_DEMO=true`, `APP_STATELESS=true`, `SESSION_SECRET` missing or shorter than 16 characters, or `MONGODB_DB` looks like a demo/staging/test database |
| `staging` | its own, e.g. `kareiq-staging` | the same as production, plus `MONGODB_DB` missing or equal to `kareiq` |
| `demo` | its own, e.g. `kareiq-demo` | `MONGODB_DB=kareiq` |
| `development` / `test` | a local data folder | `APP_DEMO=true` is only allowed here and in `demo` |

- No `APP_ENV` on a hosted server (`NODE_ENV=production`, which the Dockerfile sets, or Render/Vercel) means **production**. A misspelt `APP_ENV` also means production. Missing or malformed settings never relax the checks.
- Demo logins (published password) exist only in demo mode. Outside it they are refused at sign-in and as sessions, even if a database still holds them, and the demo seeding refuses to run.
- The error lists what is wrong by variable name and never prints values.

## 3. Staging

`render.yaml` defines `kareiq-staging`: the same Docker image, deployed from the **`staging` branch**,
with `APP_ENV=staging` and `MONGODB_DB=kareiq-staging`.

To keep staging away from production data:
1. Use a separate Atlas database user for staging, with access to `kareiq-staging` only (better: a separate cluster or project). Then a copied production variable still cannot reach live data.
2. Set staging's own `MONGODB_URI`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ALLOWED_ORIGINS` (staging website addresses only) and `OAUTH_REDIRECT_BASE` (the staging service's address).
3. Never copy production secrets to staging. `SESSION_SECRET` is generated per service.
4. The server refuses `MONGODB_DB=kareiq` in staging.

Workflow: push to `staging`, wait for `kareiq-staging`, test there (steps 5 and 6), then deploy production by hand.

## 4. Switching off automatic production deployments

- **Render**: in `kareiq-api`, open Settings → Build & Deploy → Auto-Deploy and set it to **No** (or sync the Blueprint, which sets `autoDeploy: false`). Deploy with "Manual Deploy" after staging has passed.
- **Vercel**: in each website project, open Settings → Git and either set "Ignored Build Step" so `main` is not built automatically, or add `"git": { "deploymentEnabled": { "main": false } }` to that project's `vercel.json` (an owner decision: it changes how the websites are published). Promote a tested preview deployment to production by hand.

## 5. Before every production deployment: check the target

1. In the dashboard, confirm that the service is `kareiq-api` and the branch/commit is the one tested on staging.
2. Confirm `APP_ENV=production`, `MONGODB_DB=kareiq`, `TRUST_PROXY=true`, `TRUST_PROXY_HOPS=1` and that `MONGODB_URI` and `SESSION_SECRET` are set (look at the names; never paste the values anywhere).
3. Take a backup first (`docs/BACKUP-RESTORE.md`).
4. After the deployment, `GET /api/health` must say `"storage":"mongo"`. The startup log shows `Environment: production` and no demo logins.

## 6. Hosting-side checks still to be done by hand

- **Proxy hops**: `TRUST_PROXY_HOPS=1` assumes one proxy (Render's or Vercel's load balancer) appends to `X-Forwarded-For`. Confirm it on the running service: send a request with a made-up `X-Forwarded-For: 1.2.3.4` and check that the address the app records (rate limiting) is yours, not `1.2.3.4`. If a CDN is added in front, raise the number.
- **HTTPS and HSTS**: HSTS is sent only on HTTPS requests, `max-age=86400`, without `includeSubDomains` or `preload`. Confirm that every public address (kareiq-api.onrender.com, kareiq.co.in, karehome.co.in, karenest.co.in, karewellness.co.in and their www.) redirects HTTP to HTTPS, then raise `HSTS_MAX_AGE` to 31536000. `includeSubDomains` and `preload` need every subdomain checked and the owner's approval first. The static websites' HSTS comes from Vercel, not from this server.
- **Email**: set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` and `NOTIFY_EMAIL` on staging first and send a test (sign-in link) to an address you own. Production and staging servers print `[email] ...` warnings at start for anything missing or inconsistent (variable names only), e.g. port 465 without `SMTP_SECURE=true`. No warnings means the settings are complete, not that delivery works: only a real test email proves that.
- **Plans**: both Render services are on the free plan (sleeps when idle, about 512 MB of memory for OCR). Choose a paid plan before production traffic.
