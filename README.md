# KareIQ + Kare@Home website

Two websites and one small backend in a single project:

| Page | Address |
|---|---|
| KareIQ (parent company) | `http://localhost:3000/` |
| Kare@Home (home care) | `http://localhost:3000/kare-at-home` |
| Admin: bookings and enquiries | `http://localhost:3000/admin` |
| Privacy Policy / Terms | `/privacy`, `/terms` |

## Run it

You need **Node.js 18 or newer** (https://nodejs.org). There is nothing else to install.

```bash
cd kareiq-website
cp .env.example .env        # Windows: copy .env.example .env
# open .env and set ADMIN_PASSWORD
node server.js
```

Open http://localhost:3000 in your browser.

> Open the site through `node server.js`, not by double-clicking the HTML files.
> The pages still display when opened as files, but the booking and enquiry forms
> need the server to save anything. When the server can't be reached, the forms tell
> visitors to call or WhatsApp instead.

## What the backend does

- **Kare@Home "Book a Service"** (header, hero, every service tile, every package button) opens a 2-step form. It is sent to `POST /api/bookings`, checked on the server, saved, and the visitor sees a reference like `KH-7F3K2Q`.
- **KareIQ "Talk to Our Team" / "Get in Touch" / "Let's Talk" / KareNest** open the enquiry form, sent to `POST /api/enquiries` (reference like `KQ-DBFEWW`).
- **Admin page** (`/admin`, sign in with the `ADMIN_PASSWORD` from `.env`): see every booking and enquiry, call or WhatsApp the person in one tap, set status (New, Contacted, Scheduled, Closed), add internal notes, search, and export to CSV for Excel.
- **Spam and abuse protection**: hidden honeypot field, 8 submissions per device per 10 minutes, 20 KB request limit, strict security headers.
- **Storage**: `data/bookings.json` and `data/enquiries.json`. Back up the `data` folder.

### Admin page

Open `/admin`. You'll see the sign-in page; enter the `ADMIN_PASSWORD` from your `.env` file. You stay signed in for 12 hours on that device, and "Sign out" is at the bottom of the side menu. Restarting the server signs everyone out.

**If sign-in doesn't work:**
- The sign-in page says "Admin sign-in is turned off": your `.env` file is missing or has no `ADMIN_PASSWORD` line. Create it (`cp .env.example .env`), set the password, and restart `node server.js`.
- "That password is not right": the password must match the `ADMIN_PASSWORD=` line exactly. After editing `.env`, restart the server.
- After 8 wrong tries from one device, sign-in pauses for 10 minutes.

- **Overview**: charts of bookings and enquiries over time (7 / 30 / 90 days or all time), the booking pipeline (New, Contacted, Scheduled, Closed), and breakdowns by service, package, payment plan, city, who the care is for, and enquiry interest. Hover any chart for exact numbers, or use "Show table".
- **Bookings / Enquiries**: call or WhatsApp in one tap, set the status, add internal notes, search, export to CSV.
- **Website content**: edit and publish, with no code changes needed:
  - Kare@Home pricing: price per month and billed amount for every payment plan, original price, "Launch offer" tag, which package is "Most popular", and each package's "What's included" list
  - savings % shown for each payment plan, the pricing notes, the Customised plan card
  - contact phone, WhatsApp, email and Instagram (used by every link on both sites)
  - the main headings and intro text on both home pages

  "Save & publish" updates the live site immediately. Every save keeps a backup of the previous version in `data/content-history/` (last 20). "Reset to original" restores the content the site shipped with.

### Intro animation

The KareIQ home page opens with the logo animation. It plays on a fresh visit or a reload, and is skipped when moving between pages of the site, for links to a section (like `/#team`), and for visitors who have reduced motion turned on. Visitors can press "Skip intro". The animation lives in `public/js/loader.js` and `public/css/loader.css`.

### Optional: email alerts

To get an email for each new booking or enquiry:

```bash
npm install                 # installs nodemailer (only needed for email)
```

Then fill the `SMTP_*` and `NOTIFY_EMAIL` lines in `.env` and restart. For Gmail, create an App Password and use `smtp.gmail.com`, port `587`.

## Folder layout

```
kareiq-website/
├── server.js            ← the web server (no dependencies)
├── api/index.js         ← Vercel entry point (uses server.js)
├── vercel.json          ← Vercel settings: CDN for pages, function for /api and /admin
├── src/
│   ├── catalog.js       ← services, packages, time slots: the server accepts only these
│   ├── validate.js      ← form checks (Indian mobile numbers, dates, consent…)
│   ├── db.js            ← storage: data folder locally, Upstash Redis on Vercel
│   ├── store.js         ← bookings and enquiries
│   └── notify.js        ← optional email alerts
├── admin/               ← admin page (password protected)
├── public/              ← everything visitors see
│   ├── index.html       ← KareIQ
│   ├── kare-at-home.html← Kare@Home
│   ├── privacy.html, terms.html, 404.html
│   ├── css/  kareiq.css, karehome.css, page.css
│   ├── js/   forms.js (shared), kareiq.js, karehome.js
│   └── img/  photos and logos
├── data/                ← saved bookings and enquiries (created automatically)
├── .env.example         ← copy to .env
└── package.json
```

## Things to update before going live

1. **Phone / WhatsApp number**: `+91 81293 45178` (from kareiq.co.in) is used on both sites. Change it from the admin page under Website content → Contact details. Make sure the number is on WhatsApp, since the WhatsApp buttons use it.
2. **Instagram link**: footer of `kare-at-home.html` points to `instagram.com/kareiq`.
3. **Privacy Policy and Terms** are marked as drafts. Have them reviewed before launch.
4. **Prices, contact details and headlines**: change them from the admin page (Website content). No code edits needed.
5. **Photos**: the images in `public/img` were taken from the design mockups. Swap in your original high-resolution photos with the same file names for the sharpest result.

## Deploy on Vercel

The project is ready for Vercel: `vercel.json` serves the pages, images, CSS and JS from Vercel's CDN, and sends `/api/*` and `/admin` to one serverless function (`api/index.js`, which runs the same code as `server.js`).

**Vercel servers can't save files**, so bookings, enquiries and admin edits are stored in **Upstash Redis** there (free plan available). Without it, the admin shows a red warning and anything saved disappears.

1. Push this folder to a GitHub repository (the `.env` file and `data` folder are ignored, which is correct).
2. On vercel.com: **Add New → Project**, import the repository. Leave Framework Preset as **Other**; no build command is needed.
3. In the project's **Settings → Environment Variables**, add `ADMIN_PASSWORD` (choose a strong one). Optional: `SESSION_SECRET` (any long random text), and the `SMTP_*` / `NOTIFY_EMAIL` lines for email alerts.
4. Open **Storage → Create Database → Upstash for Redis** (Marketplace), and connect it to this project. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.
5. **Deployments → Redeploy** so the new variables are picked up.
6. Visit `your-project.vercel.app/admin`, sign in, and check that no storage warning appears. Make a test booking on `/kare-at-home` and confirm it shows in the admin.

Notes for Vercel:
- Admin edits to prices or text appear on the live site within about 30 seconds (the CDN keeps a 30-second copy so pages stay fast).
- Sign-in uses a signed cookie, so it works across Vercel's servers. Changing `ADMIN_PASSWORD` signs everyone out.
- To use your own domain (e.g. kareiq.co.in), add it under **Settings → Domains**.
- Data from your computer's `data` folder is not uploaded. Bookings start fresh on Vercel.

## Hosting elsewhere

Any host that runs Node.js works (Render, Railway, a VPS with PM2, Hostinger Node hosting…).

- Start command: `node server.js`
- Set `ADMIN_PASSWORD` (and email settings) as environment variables on the host.
- Set `TRUST_PROXY=true` when the host puts a proxy in front of your app.
- The `data` folder must be on persistent storage, or bookings are lost when the host restarts. On hosts without persistent disks, attach a volume.
