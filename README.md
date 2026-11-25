# KareIQ websites and dashboard

Four websites, the KareIQ dashboard and one small backend in a single project:

| Page | Address |
|---|---|
| KareIQ (parent company) | `http://localhost:3000/` |
| Kare@Home (home care) | `http://localhost:3000/kare-at-home` |
| KareNest | `http://localhost:3000/karenest` |
| KareWellness | `http://localhost:3000/karewellness` |
| Dashboard: families, nurses and the office | `http://localhost:3000/app` |
| Admin: website text and prices | `http://localhost:3000/admin` |
| Privacy Policy / Terms | `/privacy`, `/terms` |

> The four websites (KareIQ, Kare@Home, KareNest, KareWellness) hand visitors over to the
> dashboard at `/app` (see "Connecting your dashboard"). Families, nurses and the office each
> get their own interface there.

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
- **KareIQ "Get in Touch" / "Let's Talk" / KareNest / KareWellness** open the enquiry form, sent to `POST /api/enquiries` (reference like `KQ-DBFEWW`).
- **Admin page** (`/admin`, sign in with the `ADMIN_PASSWORD` from `.env`): see every booking and enquiry, call or WhatsApp the person in one tap, set status (New, Contacted, Scheduled, Closed), add internal notes, search, and export to CSV for Excel.
- **Spam and abuse protection**: hidden honeypot field, 8 submissions per device per 10 minutes, 20 KB request limit, strict security headers.
- **Storage**: `data/bookings.json` and `data/enquiries.json`. Back up the `data` folder.

### Admin page

Open `/admin`. You'll see the sign-in page; enter the `ADMIN_PASSWORD` from your `.env` file. You stay signed in for 12 hours on that device, and "Sign out" is at the bottom of the side menu. Restarting the server signs everyone out.

**If sign-in doesn't work:**
- The sign-in page says "Admin sign-in is turned off": your `.env` file is missing or has no `ADMIN_PASSWORD` line. Create it (`cp .env.example .env`), set the password, and restart `node server.js`.
- "That password is not right": the password must match the `ADMIN_PASSWORD=` line exactly. After editing `.env`, restart the server.
- After 8 wrong tries from one device, sign-in pauses for 10 minutes.

- **Enquiries, bookings and Bystander requests** are handled in the dashboard (`/app`, Office ▸ Lead management), where each one has an owner, a status and a history. The link in the side menu goes there.
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

## KareWellness, Bystander and the free day pass (30 Oct 2026)

- **KareWellness is its own website** (`public/karewellness/`, served at `/karewellness` here, its own domain when deployed: `karewellness.co.in` is assumed in `js/sites.js`). Pages: home, **KareBalance** (`/karebalance`) and **KareMind** (`/karemind`) with every package, price, inclusion, exclusion and the terms. **Book a Service** opens your family dashboard (see Connecting your dashboard) with the chosen package. KareIQ links to it from Our Care Ecosystem; KareNest and Kare@Home show short introductions with **Know More** buttons.
- **Bystander** (Half Day 4 h ₹799, Full Day 8 h ₹1,299, Round the Clock 24 h ₹2,499) is on **KareIQ** (`/bystander`) and **Kare@Home** (`/kare-at-home/bystander`) only, under Our Packages. **Book Now** opens a booking form on the page (no sign-in): option, date and start time, the customer's and the patient's details, location and full address, notes. Requests appear among the bookings in the admin page with a reference like `BY-7F3K2Q`.
- **KareNest free day pass**: the "Come Experience KareNest. Your First Day Is Free!" section on the KareNest home page; **Book Your Free Day Pass** (and the header's Plan a Visit) opens the visit form.
- Wording and prices for KareBalance, KareMind and Bystander live in **one file**: `tools/shared/wellness.js`. After changing it, rebuild:

```bash
node tools/karewellness/build.js   # the KareWellness website
node tools/kareiq/build.js         # KareIQ /bystander (header and footer come from public/index.html)
node tools/karenest/build.js
node tools/karehome/build.js
```

- To deploy KareWellness on its own: `node tools/karewellness/build.js --standalone ../karewellness-only` (a ready Vercel project, like KareNest's). Add its domain to `ALLOWED_ORIGINS` on the server so its enquiry form can send.
- Old addresses (`/karenest/karebalance…`, `/karenest/karemind…`, `/kare-at-home/karebalance`, `/karewellness#karebalance`) open the matching KareWellness page.

## Connecting your dashboard

Every **Sign in** link, every package button ("Choose HomeStart", "Enquire About KarePlus") and every
KareWellness **Book a Service** button sends visitors to one address, set in one line of
`public/js/sites.js` (and `tools/karenest/standalone/sites.js` for the separate KareNest site):

```js
window.KARE_APP = '/app/';   // change to your dashboard, e.g. 'https://app.kareiq.co.in/'
```

The websites add what the visitor chose to the end of that address, so your dashboard can continue:

| Visitor clicks | Opens |
|---|---|
| Sign in (Kare@Home) | `KARE_APP#/signin?brand=karehome` (`karenest`, or no brand on KareIQ) |
| A package, e.g. HomePlus on the 12-month plan | `KARE_APP#/plans?brand=karehome&plan=homeplus&months=12` |
| A KareNest package | `KARE_APP#/plans?brand=karenest&plan=kareplus&months=3` |
| KareWellness Book a Service | `KARE_APP#/plans?brand=karehome&plan=kb-plus` (KareBalance) or `brand=karenest&plan=km-base` (KareMind); `KARE_APP#/plans` from the header |
| "Create your account" after a website booking | `KARE_APP#/start?ref=KH-7F3K2Q&brand=karehome` |

Package ids are listed in `src/catalog.js` and `tools/shared/wellness.js`. Bookings, enquiries and
Bystander requests are saved by this server and handled in the dashboard (Office ▸ Lead management).
`KARE_APP` is `/app/`: the dashboard in this project. On the live sites, `vercel.json` and the
standalone builders forward `/app` to the Render server, where the dashboard runs.

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

**Try it on your computer:** `node server.js`, open http://localhost:3000/app. Without a database, demo logins are created (password `demo-pass-123`): `family@demo.kareiq` (mother on Kare@Home, father at KareNest), `arjun@demo.kareiq` (Kare@Home only), `meena@demo.kareiq` (KareNest, so also Kare@Home), `rahul@demo.kareiq` (plan being set up), `nurse@demo.kareiq`, `nest@demo.kareiq`, `admin@demo.kareiq`. The four team dashboards: `finance@demo.kareiq` (Finance Manager), `hr@demo.kareiq` (HR), `ops@demo.kareiq` (Operations Manager), `sales@demo.kareiq` (Sales Executive). Delete the `data` folder to start again. With the server running, `npm run check:app` runs the end-to-end checks.

**Where things are:** `app/` (the screens), `src/app/` (sign-in, permissions, plans, readings), `src/docs.js` (storage for MongoDB, Redis or files). Plan names per brand are in `src/app/products.js`. KareNest plans are the website packages (KarePlus, KarePremium, Bloom, Flourish, Thrive, KareBalance and KareMind) listed in `src/catalog.js`.

### Dashboard pages (one layout for everyone)

Top bar plus a side menu. Families and the office pick the person from "PATIENT NAME" at the top.
- **Dashboard**: risk scores; a summary of the latest readings, coloured against the standard ranges; charts for the last 7 days, a month, 6 months, a year or chosen dates; "Download trends" (a PDF report).
- **Medical records**: upload PDFs or photos (up to 5 MB, stored in MongoDB), filter by type, then download one or several.
- **Package information**: dates, amount paid, packages, free sessions and what is monitored, and how often.
- **Book services**: free physiotherapy or bystander sessions (4, 6 or 8 a year), add-on services, and your bookings.
- **Invoices**: the charges worked out from each plan.
- **Nurses** (caregiver logins) get the nurse portal instead; the **office** gets the office interface (both below).

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
- **Kare@Home** (multi-page): `node tools/karehome/build.js` builds `/kare-at-home` (home with About Us, Our Services and Contact), `/kare-at-home/packages`, `/kare-at-home/bystander` and `/kare-at-home/faq` from `tools/karehome/source.html` (the Kare@Home content).
- **KareWellness**: `node tools/karewellness/build.js` (add `--standalone ../karewellness-website` for its own domain). **KareIQ Bystander and FAQ pages**: `node tools/kareiq/build.js`.
- **FAQs**: the questions for KareIQ, Kare@Home and KareNest are in `tools/shared/faq.js`. Change them there, then run the three builders above.
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
│   ├── notify.js        ← optional email alerts
│   ├── docs.js          ← dashboard storage (data folder locally, MongoDB live)
│   └── app/             ← dashboard server: sign-in, permissions, plans, readings, scheduler,
│                          nurse portal (nursing.js), office (office.js), finance, staff
├── app/                 ← the dashboard pages: app.js (families), nurse.js, office.js (/app)
├── ocr/                 ← reads report dates from uploaded medical reports (Docker on Render)
├── admin/               ← website editor (password protected)
├── public/              ← everything visitors see
│   ├── index.html       ← KareIQ
│   ├── kare-at-home.html← Kare@Home home page (+ kare-at-home/ for its other pages)
│   ├── karenest/        ← KareNest pages (generated by tools/karenest/build.js)
│   ├── karewellness/    ← KareWellness pages (generated by tools/karewellness/build.js)
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
- **Render** builds the `Dockerfile` (`runtime: docker` in `render.yaml`), which installs Node plus the report-reading tools and runs `node server.js`. An existing Node-runtime service can't switch runtime: create a new Docker web service from the same repo with the same environment variables (or apply the Blueprint). Environment variables:
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

## Public demo: Vercel pages + Render demo server

`node tools/demo/build.js ../kareiq-demo` writes the demo website (demo ribbon, demo logins, no
passwords or `.env`). Deploy that folder as its own Vercel project. Vercel serves the pages and passes
`/api`, `/app` and `/admin` straight through to the Render service **kareiq-demo** (`render.yaml`), so
the browser stays on the demo address. That service:

- runs from the Dockerfile, so uploaded reports are read and stored like on the live app;
- has `APP_DEMO=true` and its own database `MONGODB_DB=kareiq-demo` on the same Atlas cluster, so demo
  changes are kept and never touch the live `kareiq` data. The server refuses to start a demo on `kareiq`;
- fills itself with the demo logins and sample people the first time it starts on an empty database.

A different Render address: `DEMO_BACKEND=https://name.onrender.com node tools/demo/build.js ../kareiq-demo`.
`DEMO_BACKEND=vercel` builds the old all-in-Vercel demo (no report reading, nothing kept without a database).

## Customer lifecycle: package request to nurse onboarding (20 Nov 2026)

Enforced on the server (`src/app/lifecycle.js`); the screens only reflect it.

1. **Request.** A customer's "Request this package" creates an order with status `awaiting_approval`
   (`app_orders`) and an enquiry (`kind: 'order'`) in Office › Lead management › Enquiry database. A plan
   request from "Add a plan or booking" (`kind: 'plan-request'`, a pending `app_plans` row) is handled the same way.
2. **General Information.** In the enquiry, the Operations Team (office logins) fills Name, Date of Birth,
   Age (worked out from the date of birth, never typed), Gender, Blood Group, Qualifications, Languages Spoken,
   Address, Email, Primary and Secondary Contact Number. It is saved in the customer's own details record
   (`app_details`), never a new customer, with a version in `app_details_versions` (`source: 'operations'`,
   the enquiry reference) and a line in the enquiry history.
3. **Approval.** "Approve package" works only after step 2. The order moves to `awaiting_payment`; for a plan
   request an order is created from the published price, or the agreed amount for packages priced on call.
   "Decline request" needs a reason.
4. **Payment.** Settings › Requests and orders › record the payment (full amount only). The package becomes
   active, carrying the approval. A package activated directly by the office (Activate) counts as approved,
   and its payment is confirmed once the invoice is fully paid.
5. **Nurse assignment.** A nurse is assigned only to a customer who has bought a package (an active package).
   Before that the office cannot assign one, and a customer without an active package never appears in any
   nurse's Assigned customers, even with an older link or visit.
6. **Eligibility.** A customer is ready for onboarding only with an active package that was approved and whose
   payment is confirmed. The assigned nurses get a notification. Nurse › Customer Onboarding lists only those
   customers (Pending) and the ones already onboarded (Completed). The onboarding API refuses everyone else.
7. **Onboarding.** As before: once only (atomic insert), read only afterwards. The General Information from
   step 2 is shown read only and is added to the record on the server (nurses never see full numbers).
   The nurse is taken to the customer under Assigned customers, which shows the completed details
   (there is no separate Customer Profiles section).

**Contact numbers.** The customer's Primary and Secondary Contact Number and email are masked for nurses
everywhere (API and screens). Request Access names the details and the reason. The office approves (all or
some of the requested details, for a set time) or rejects it, in Office › Contact access audit, and can revoke
an approval. An approval opens only those details, for that customer and that nurse. Emergency and doctor
numbers keep the contact policy (visit, approval or emergency).

**Navigation.** Nurse: Assigned customers (each customer's details, after onboarding too), Customer Onboarding (its own section), Assessment › Regular Checkup,
Upload Documents › Upload and Your Submissions. Customers and the office: KareIQ Policies is one section, with
the seven categories as filters inside it.

Tests: `node tools/check-lifecycle.js http://localhost:3000` on a fresh demo server.

## Customer photos and the cartoon with Nestu (21 Nov 2026)

**Taking the photo.** Nurses take the customer's photo with the device camera: on the onboarding page
("Customer photo"), on the customer page ("Take photo" / "Take a new photo"), or from the "Photo needed"
line in Assigned customers. The camera opens with a face guide; after the shot the nurse checks it and
chooses **Retake** or **Save**. Saved photos are JPEGs under 2 MB. If the browser cannot open the camera
(permission refused, older phone), the phone's camera app opens instead and the same Retake / Save step
follows. The office can also take or upload a photo from Profile. Families see the photo but cannot change it.
The camera needs `Permissions-Policy: camera=(self)` (server.js and vercel.json); microphone and location stay off.

**Every 6 months.** A photo is due when an onboarded customer with an active package has no photo, or the
photo is 182 days old. Their assigned nurses get one notification per due photo (when they open the portal,
and from an hourly check), the customer shows "Photo needed" / "New photo due" in Assigned customers, and
the onboarding and customer pages show the next due date. A new photo clears it.

**The cartoon (family Home).** Home's greeting shows the default illustration (`app/img/home-hero.webp`).
Once a customer has a photo, and an AI image service is set up, KareIQ sends the photo and Nestu
(`public/karenest/images/mascot.webp`) to the service and shows the returned animated picture of the
customer with Nestu side-hugging them. It is made in the background after each new photo, replaces the
previous one, is removed with the photo, and is retried up to 3 times if the service fails (`src/app/photos.js`).
It is **off** until you add, in Render → Environment (kareiq-api, and kareiq-demo if wanted):

| Setting | Value |
| --- | --- |
| `CARTOON_PROVIDER` | `openai` or `gemini` |
| `OPENAI_API_KEY` | your OpenAI key (for `openai`) |
| `GEMINI_API_KEY` | your Google AI Studio key (for `gemini`) |
| `CARTOON_MODEL` | optional: default `gpt-image-1.5` (OpenAI) or `gemini-3.1-flash-image` (Gemini) |

The provider bills each picture. Customers' photos are sent to that provider, so check its data terms.
Checks: `npm run check:photos` (the cartoon requests are tested against local stand-ins, no real key needed).

## Health insights (21 Nov 2026)

**Health details → Health insights** (`#/health/insights`) explains what a person's own records show, and Home's
"Your Health Insights" card shows the top three (each opens the page at that insight). The insights come from
`app/insights.js`, which reads the person's 6-month dashboard and only counts, averages and compares what is
recorded, using the levels KareIQ's standard ranges already gave each reading (no new clinical calculation):
the overall risk category with its reason; each measure's last 30 days against the 30 days before (readings
outside the range, average higher / lower / about the same, more readings in range = improving; "slightly
outside" such as Overweight is "worth watching"); an old result with nothing newer; a measure checked at every
visit but not for 14+ days; a clear weight change; wellbeing items flagged at the latest check or more than
once; and how many readings were recorded. Sections: Needs attention, Worth watching, Improving, Going well.
No data gives no insight. Checks: `npm run check:insights`.

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


## Nurse portal, office interface and the nurse scheduler

Each role has its own interface. Families keep the pages above. Nurse and office pages are separate scripts
(`app/nurse.js`, `app/office.js`) that load only for that role; a family never downloads them.

### Nurse portal (caregiver logins)
- **My visits** (landing page): today, upcoming, completed and cancelled visits. Accept, Start visit, Record readings, Complete visit.
- **Scheduler**: day, week and month views; filter upcoming, completed or cancelled.
- **Assigned customers** and **Customer information**: only what a visit needs (ID, age, gender, blood group, languages, address,
  emergency contacts, doctors, upcoming visits). Phone numbers show as `+91 XXXXX 12345` until **Access contact information**.
- **Upload documents**: submit a report for an assigned customer. After submitting, the nurse gets a receipt only: no opening,
  downloading, replacing or deleting.
- **Risk checks** and **Record a visit** (readings) are done by the nurse, for their assigned customers only. The office does neither.
- Nurses do **not** see vitals history, earlier risk scores, medical records, invoices or packages. The server refuses those
  requests (403/404) whatever the screen shows.

### Contact access (masked numbers)
The office picks the policy under **Contact access audit**:
- `visit` (default): numbers open during the nurse's assigned visit (from an hour before the slot until 30 minutes after it),
  or in an emergency with a written reason (open for 30 minutes; the office is notified).
- `approval`: every request waits for the office to approve it (for 1 to 24 hours).
- `emergency`: only in an emergency with a reason.
Every request, allowed or not, is recorded (`app_contact_access`: event ID, nurse, employee ID, customer, contact type, time, visit,
reason, approval, result). The numbers themselves are never written into the record, and nurses cannot change it.

### Nurse scheduler
- Two slots: **Morning 8 AM to 12 PM** and **Evening 2 PM to 6 PM** (websites and app). Older "afternoon" bookings count as evening.
- Every Kare@Home or KareNest booking with a date becomes a visit (`app_schedule`) and is given a nurse automatically:
  availability first (working day and slot, leave, holidays, brand, service, no overlap including travel time, per-slot limit),
  then fairness (fewest visits that week, then that day, then the longest since their last visit).
- Assignment runs inside a lock and re-checks before saving; with MongoDB, unique indexes on nurse+day+start and on the booking
  stop double bookings even across two servers.
- If nobody is free the visit is **Awaiting assignment**, the office is notified, and they assign it by hand.
- Statuses: Awaiting assignment, Nurse assigned, Accepted, In progress, Completed, Cancelled (office only). Every change is in the visit history.
- Leave added for a nurse moves their visits in that period to someone free (or back to the office).

### Office interface (admin logins)
Overview (customer and revenue analytics), Lead management (overview, enquiry database, assign to a member), Customer management
(directory with customer IDs, filters and pages; consolidated profile, viewed as the office, never by signing in as the customer),
Customer care (vitals, risk trends, records, package and client information; risk checks and visits are the nurses'), Financials
(invoices with PDF download, payment due, recording payments and refunds), Employees (overview, KYC and details with length of
service), Nurse scheduler (visit board, nurses and hours, holidays), Contact access audit, and Settings (requests and orders,
people and plans, logins, activity, website text and prices).

Money: an invoice exists for every confirmed package; **collected** counts only recorded payments (verified orders, or payments
the office records after checking the bank), minus refunds. Unpaid invoices never count as collected. An invoice is due 7 days after its date.

### Checks
```
npm run check:scheduler                     # scheduler rules, no server needed
APP_DEMO=true node server.js                # fresh data folder, then in another terminal:
npm run check:roles                         # nurse, office and role walls
npm run check:trends
npm run check:app
```

### Bystander in the dashboard
Families see **Bystander** under Other packages: Half Day (4 hours), Full Day (8 hours) and Round the Clock (24 hours) at the
website prices, which come from `tools/shared/wellness.js`, plus long-term care agreed with the team. Buying one works like any
fixed-price package: the office checks the payment, it shows under My package next to the main package, with an invoice. The
office arranges the caregiver and timing. Bystander requests from the websites appear in Lead management. The prices make no GST
claim, because the website doesn't say either way.

### Risk trends (families)
Laid out like Vitals: a summary card per risk check on the left (latest score in its category colour, band, date, trend), and on
the right the period, Download trends, a button per check and the chosen check's history chart and facts.

### KareWellness intro
KareWellness has an intro like the other three sites (`public/karewellness/loader.css` and `loader.js`). It plays on a fresh
visit or a reload, never between pages or with reduced motion, and can be skipped. The footer logo has a hover animation.

### FAQ pages
Each website has its FAQs on a page of its own (they used to be a section of the home page). The pages are **/faq** on KareIQ,
**/kare-at-home/faq** and **/karenest/faq** here, and **/faq** on each site's own domain. Each is linked from the menu, the phone menu and
the footer. The page has a search box, which filters the questions as you type, and topic links that stay in view beside the
questions. `/faq#q-3` opens question 3. Old links to `#faq` on a home page open the FAQ page (`public/js/faq-page.js`, styles in
`public/css/faq.css` and `public/karenest/site.css`). KareWellness has no FAQ content yet; add a `karewellness` entry to
`tools/shared/faq.js` and a page in `tools/karewellness/build.js` when there is one.

## Medical document intelligence (nurse and customer uploads)

Every medical document uploaded from the nurse portal (Upload documents) or a customer's Medical records goes through one pipeline (`src/app/docintel.js`):
`Uploaded → Processing → Extracted → Completed | Failed` (Needs Review only for documents from before 20 Nov 2026).

1. **Check:** the file type is checked by its content (PDF, JPEG, PNG or WebP, at most 5 MB). A SHA-256 fingerprint is stored, so the same file for the same person is one document, even if it is sent twice at once. The fingerprint is checked again before the file is read.
2. **Read:** `ocr/report_reader.py` takes the PDF text layer when there is one. Otherwise it reads the page with OpenCV preparation and Tesseract 5's pretrained LSTM neural-network OCR, keeping each word's confidence.
3. **Extract:** `src/app/docextract.js` classifies the document and keeps the test or collection date apart from the report date and the printed date. It reads **every result** in the report: the values KareIQ stores (vitals and the risk engine's inputs) and every other test (CBC, triglycerides, LDL, thyroid, urine findings and so on), with unit, flag, reference range, page, line, section and confidence. Units are converted only by fixed factors. Patient details, dates, phone numbers and the interpretation tables printed under a result are not results.
4. **Store (no review, the owner's decision of 20 Nov 2026):**
   - Vitals and risk inputs become readings (`source: 'document'`, linked to the document and the extraction), even when unusual. A value outside the usual possible range, a "<" or ">" value (stored as the number), a missing unit (the usual unit is assumed), a two-digit year, sugar without a fasting or after-meal label (stored as random) or a lower reading confidence is stored with a note saying so.
   - Date: the test or collection date; otherwise the latest of several test dates, the report date, another date printed on the report, or the upload day, in that order. The note says which was used.
   - Kept as written but not used as that reading: plain CRP (the rules use hs-CRP) and a unit with no fixed conversion (HbA1c in mmol/mol).
   - Every other result is saved with the document and the person (`app_extractions`, `kind: 'other'`, status `stored`). It is not shown in Vitals and not used by the risk engine. Families and the office see it in "What was read".
   - The same measurement or result is never stored twice.
   - Documents left waiting for review under earlier rules are read again automatically when the server starts. The office's review screen stays for those.
5. **Risk:** the existing risk engine recalculates from the stored readings. Extraction never calculates risk.

Failures that may pass are retried automatically (3 attempts); the office can also process a document again. Nurses see only the processing status. They never see the values read or any risk result; the server enforces this. Reports dated before a customer's registration are shown too: health history starts at the registration date or at the oldest record, whichever is earlier (Vitals period "All"). The risk engine uses them like any other reading.

On a server without Tesseract, Poppler and OpenCV, documents stay Failed and are retried. The Dockerfile installs all three; on Render the service must run from the Dockerfile.

Tests: `node tools/check-docs.js http://localhost:3000` on a fresh demo server. It needs `python3` with `reportlab` and `Pillow` to build the test documents.

## Team dashboards: Finance Manager, HR, Operations Manager, Sales Executive

Four office roles beside the office admin, each with its own landing page and only its own modules,
all inside the same office interface (`app/office.js`) and on the same records:

| Role | Reused modules | Added (src/app/teams.js) |
|---|---|---|
| Finance Manager (`finance`) | Financials (invoices, payment due, recording payments and refunds), revenue analytics | Financial overview, payments and refunds ledger, gateway/bank statement reconciliation with history, expenses (approved by someone else), financial reports (CSV) |
| HR (`hr`) | Employees (records, KYC documents), Leave records | Employee onboarding checklist, employment history, credentials with expiry reminders, attendance, leave balances, HR reports |
| Operations Manager (`operations`) | Customer directory (operational profile only), Nurse scheduler, leave records (read only) | Operations overview, visit tracking (missed, delayed, rescheduled), rescheduling through the scheduler, nurse capacity and conflicts, onboarding operations, service quality (issues and recorded feedback), reports |
| Sales Executive (`sales`) | Lead management (overview, enquiry database, assigning, General Information) | Sales overview with pipeline value, follow-ups with reminders, contact history, packages and enquiries, sales reports |

More for each role (`src/app/teamsplus.js`):
- **Finance:** GST summary (rates set by Finance; GST = inclusive amount × rate ÷ (100 + rate)), credit notes (reduce what is owed everywhere), profit and loss with monthly category budgets.
- **HR:** leave for every employee (one leave system), payroll inputs (days, attendance, paid and unpaid leave; no salary calculation), training plans with reminders.
- **Operations:** on-time performance against a target, visits by area (from the customer's address; no map service), family feedback after each completed visit (a low rating opens a service issue).
- **Sales:** lost reasons (required for Sales), quotations with PDF, monthly targets set by the office admin, merging repeat enquiries.
- **Everyone:** "My leave and training" (request leave, see balances and trainings; nurses have it in their portal), the team's activity log, PDF versions of every report, e-mail copies of notifications for team logins when e-mail (SMTP) is set up.

The last round (`src/app/teamsmore.js`):
- **Finance:** package renewals (packages ending in 30 days), supplier bills with part payments and overdue alerts, the accounts export (double-entry journal as CSV/PDF and Tally XML; create the listed ledgers in Tally first).
- **HR:** salaries (earnings and fixed deductions entered by HR; KareIQ does not work out PF, ESI or tax) and payslips (loss-of-pay days from attendance and leave, editable before issuing; PDF; every employee downloads their own under "My leave and training"), recruitment to employee in one step, probation and yearly reviews, the exit checklist (the login is switched off on or after the last day).
- **Operations:** nurse suggestions for visits waiting for a nurse (free nurses ranked by who already cares for the customer, area and load; one click assigns), supplies with low-stock alerts, actual visit times from the nurses' Start and Complete taps.
- **Sales:** pipeline board (drag a card to change the status), renewal leads made automatically for packages ending soon, message templates filled in per lead (WhatsApp, email, SMS), commission on paid revenue at the rate the office admin sets.

Business growth (`src/app/teamsgrowth.js`):
- **Finance:** add-on services (a paid extra service is charged once its visit is done, at Finance's price less the package's add-on discount; billed per family with a PDF; free package sessions are never charged), package income month by month (active, new, renewed, ended without renewal, spend per paying family), every discount given (quotations, credit notes, package add-on discounts) with who gave it.
- **HR:** nurse skills (services a nurse can be booked for, which the scheduler and nurse suggestions follow, and the package checks they are trained for), each nurse's work in the last 12 months (visits, on time, family ratings) beside their review.
- **Operations:** package visits used this month against the visits each package includes (set by Operations), free sessions left this year, and how often each family gets their regular nurse.
- **Sales:** upgrade suggestions by package and time with KareIQ (never health data) turned into leads, family referrals with the reward rule set by the office admin, and campaign results (leads, joined, revenue, cost per lead).

Permissions are enforced on the server (`src/app/access.js`): every `/api/app/admin/...` call checks the
role first, and a team login cannot use any family or nurse route. Team roles never see health
readings, medical records or risk results. Sales cannot approve packages or confirm payments.
The office admin keeps every permission and reaches the new pages from its own menu groups (Financials, Employees, Customer management, Nurse scheduler, Lead management, Reports).
Create team logins under Settings > Logins. Checks: `npm run check:teams`, `npm run check:teams-ui`, `npm run check:teams-more`, `npm run check:teams-more-ui`, `npm run check:teams-growth` and `npm run check:teams-growth-ui`
(Python Playwright) against a fresh demo server.

