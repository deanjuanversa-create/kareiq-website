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

## The KareIQ app (My KareIQ, at `/app`)

One sign-in for **families**, **caregivers** and the **office team**, across both brands.

| Who signs in | What they see |
|---|---|
| A family with a Kare@Home plan only | Goes straight into Kare@Home; KareNest is not shown |
| A family with a KareNest plan | KareNest **and** Kare@Home: Kare@Home is included with KareNest (set in `INCLUDES` in `src/app/products.js`) |
| A family with both (e.g. mother at home, father at KareNest) | A "Where would you like to go?" screen with one tile per brand, like choosing a profile on Netflix. A **Switch** button at the top moves between them |
| A caregiver | The people assigned to them, with a big **Record visit** button |
| Office admin | Both brands plus the **Office**: requests, people and plans, logins, activity |

**New families can sign up in the app:** **Create an account** on the sign-in page (name, mobile number, password), then they pick Kare@Home or KareNest and a plan. It lands in the office inbox as "New plan (app)" with an **Activate plan** button. Mobile numbers are not checked by SMS yet, so if a self-made account uses the same number as someone else's website booking, the office is asked to confirm on the phone before linking them.

**How a plan gets to the family (no extra work for the family):**
1. A family books on the Kare@Home site or sends a Join / Visit request on KareNest. The thank-you screen now has **Create your account**: they confirm the booking with their mobile number, choose a password, and see "Your plan is being set up".
2. The booking appears in **Office → Requests** with an **Activate plan** button. Choose the plan, start date and (optionally) a caregiver. If the family hasn't made an account yet, one is made for them and you get a **welcome link** with a **Send on WhatsApp** button (and email, if SMTP is set up).
3. From then on the family sees health readings, charts, visit notes, their care team and plan, and can ask for an extra visit, a plan change or a question. Their requests land in the same inbox.

Walk-ins and phone bookings: **Office → Add a family**. New caregivers and office staff: **Office → Logins → Add**.

**Sign in:** with mobile number or email. "Forgot password?" emails a link when SMTP is set up; otherwise the request appears in the inbox with a **Send sign-in link** button.

**The first office login** is `ADMIN_EMAIL` (default `admin@karenest.co.in`) with the `ADMIN_PASSWORD` password. Signing in to the app as an office admin also opens the website editor at `/admin`.

**Safety rules carried over from the dashboard spec:** families only ever see their own people (anything else answers "not found"); health readings are never deleted, a wrong one is removed with a reason and kept in the record; no "normal/high" labels until the doctors approve the reference ranges; signed out after 15 minutes without activity (4 hours at most); every action is in **Office → Activity**.

**Try it on your computer:** `node server.js`, open http://localhost:3000/app. Without a database, demo logins are created (password `demo-pass-123`): `family@demo.kareiq` (mother on Kare@Home, father at KareNest), `arjun@demo.kareiq` (Kare@Home only), `meena@demo.kareiq` (KareNest, so also Kare@Home), `rahul@demo.kareiq` (plan being set up), `nurse@demo.kareiq`, `nest@demo.kareiq`, `admin@demo.kareiq`. Delete the `data` folder to start again. With the server running, `npm run check:app` runs the end-to-end checks.

**Where things are:** `app/` (the screens), `src/app/` (sign-in, permissions, plans, readings), `src/docs.js` (storage for MongoDB, Redis or files). Plan names per brand are in `src/app/products.js`. KareNest plans are the website packages (KarePlus, KarePremium, Bloom, Flourish, Thrive, KareBalance and KareMind) listed in `src/catalog.js`.

### Dashboard pages (one layout for everyone)

Top bar plus a side menu. Families and the office pick the person from "PATIENT NAME" at the top.
- **Dashboard**: risk scores; a summary of the latest readings, coloured against the standard ranges; charts for the last 7 days, a month, 6 months, a year or chosen dates; "Download trends" (a PDF report).
- **Medical records**: upload PDFs or photos (up to 5 MB, stored in MongoDB), filter by type, then download one or several.
- **Package information**: dates, amount paid, packages, free sessions and what is monitored, and how often.
- **Book services**: free physiotherapy or bystander sessions (4, 6 or 8 a year), add-on services, and your bookings.
- **Invoices**: the charges worked out from each plan.
- **Caregivers** get My people, Record a visit (vitals, smart-scale readings and the food, toilet, sleep, pain and medicine checks), Risk checks and Medical records. They do **not** see health history: only the family and the office do.

Where the numbers come from (the KareIQ sheet "Draft Data Collection by Caregivers"):
- `src/app/vitals.js`: standard ranges and the visit checks.
- `src/app/risk.js`: the risk formulas and bands.
- `src/app/care.js`: what each package monitors, free sessions and add-on services.
- `src/app/report.js`: the PDF report. It needs `pdf-lib`, which `npm install` adds.

### Continue with Google / Facebook (optional)

The sign-in pages (KareNest `/sign-in` and the app) show "Continue with Google" and "Continue with Facebook". A button works only when its keys are set on the API server; until then it says "Not available yet" and email sign-in is used. No key is ever sent to a browser.

1. **Google**: Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID (Web application). Authorised redirect URI: `https://kareiq-api.onrender.com/api/app/auth/google/callback`.
2. **Facebook**: developers.facebook.com → Create app → Facebook Login → Settings. Valid OAuth Redirect URI: `https://kareiq-api.onrender.com/api/app/auth/facebook/callback`. Ask for the `email` permission.
3. In Render → kareiq-api → Environment add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, and `OAUTH_REDIRECT_BASE` = `https://kareiq-api.onrender.com`. Save; Render restarts the server.

How it links accounts: a Google/Facebook login is matched to an existing account with the same (provider-verified) email; otherwise a new family account is created, as with "Create an account". Checks: `node tools/check-oauth.js` runs the whole flow against fake providers.

## The websites are built from small source files

- **KareNest** (multi-page): `node tools/karenest/build.js` writes `public/karenest/*.html` from `tools/karenest/` (`layout.js` header/footer/widgets, `pages.js` page content, `data.js` packages and prices). Add `--standalone ../karenest-website` to also write the copy deployed to karenest.co.in. Styles and behaviour are in `public/karenest/site.css` and `app.js`.
- **Kare@Home** (multi-page): `node tools/karehome/build.js` builds `/kare-at-home` (home with About Us, Our Services and Contact), `/kare-at-home/packages` and `/kare-at-home/karebalance` from `tools/karehome/source.html` (the Kare@Home content).
- Change content in those source files, rebuild, then deploy. Do not edit the generated `.html` files directly.

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
├── admin/               ← website editor (password protected)
├── app/                 ← the KareIQ app: families, caregivers, office (/app)
├── src/app/             ← app sign-in, permissions, plans, readings
├── public/              ← everything visitors see
│   ├── index.html       ← KareIQ
│   ├── kare-at-home.html← Kare@Home home page (+ kare-at-home/ for its other pages)
│   ├── karenest/        ← KareNest pages (generated by tools/karenest/build.js)
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

## Live setup: Vercel + Render + MongoDB Atlas

```
 visitors -> Vercel (static pages)                  -> Render (server.js)           -> MongoDB Atlas
             karenest.co.in (KareNest)                 api.<domain>                    bookings, enquiries,
             kareiq-website-full.vercel.app            forms, admin-edited content,    website content
               (KareIQ, Kare@Home)                     admin panel at /admin
```

- **Vercel** serves the pages as static files only (`vercel.json`: `outputDirectory: public`; `.vercelignore` keeps the server out).
- **The pages call the API directly** at its own address, set in ONE line:
  `public/js/api.js` here, and `js/sites.js` in the KareNest project (`window.KARE_API = ...`).
  On your own computer (`localhost`) the local server is used automatically.
- Admin-edited text and prices load in the background (`js/api.js`), so pages never wait for the server.
  If it is asleep or down, pages show the built-in text and forms show a "call or WhatsApp us" message.
- **Render** runs `node server.js` (see `render.yaml`). Environment variables:
  `MONGODB_URI`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `TRUST_PROXY=true`,
  `SITE_URL` (where people who open the API address in a browser are sent) and
  `ALLOWED_ORIGINS` (websites allowed to send forms, e.g. `https://karenest.co.in,https://www.karenest.co.in,https://kareiq-website-full.vercel.app`).
  Every website address that has forms must be in `ALLOWED_ORIGINS`, or the browser blocks its forms.
- **Content Security Policy:** `vercel.json` allows scripts and requests to `https://kareiq-api.onrender.com` and
  `https://api.karenest.co.in`. If the API moves to another address, add it there too.
- **MongoDB Atlas** collections: `bookings`, `enquiries`, `settings` (website content), `history` (content backups).
- Health check: `https://<api address>/api/health?db=1` should answer `{"ok":true,"storage":"mongo",...}`.
- Render's free plan sleeps after 15 minutes without visits (the first request then takes about a minute).
  Keep it awake with a free uptime monitor opening `/api/health` every 5 minutes, or use a paid Render plan.

### Domains (GoDaddy DNS for karenest.co.in)

| Type  | Name | Points to                                        | For                            |
|-------|------|--------------------------------------------------|--------------------------------|
| A     | @    | the IP Vercel shows (usually 76.76.21.21)        | karenest.co.in -> KareNest     |
| CNAME | www  | the value Vercel shows (cname.vercel-dns.com)    | www.karenest.co.in             |
| CNAME | api  | the value Render shows (kareiq-api.onrender.com) | api.karenest.co.in -> the API  |

## Older setup: everything on Vercel

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

## Report dates (automatic) and package purchases

**Report dates** are never typed in by anyone. When a report is uploaded in Medical records, the server reads its date from the document:
`ocr/report_reader.py` takes the PDF text layer when there is one, otherwise renders the page (Poppler), prepares it with **OpenCV** (grayscale, resize, denoise, straighten, even lighting, threshold) and reads it with the **Tesseract** OCR engine; `src/app/reportdate.js` then picks the report date by its label (report, collection, test, visit...), ignoring birth, follow-up, bill and expiry dates. If no usable date is in the report, it shows "Date not found in the report" (nothing is guessed). The office can only ask for a report to be read again.

These tools come with the `Dockerfile`. Run the Render service from the Dockerfile (Docker runtime) to switch automatic reading on. On a server without them, uploads still work, and their dates are read automatically as soon as the server has the tools (on the next start).

**Buying a package** (Other packages > Buy now) creates an order with the price worked out on the server. There is no online payment gateway yet: the office sends a payment link, then records the payment (method, transaction number, full amount) under Requests > Orders awaiting payment. Only then does the package become active (it replaces an active package of the same kind). Orders can also be marked failed or cancelled.
