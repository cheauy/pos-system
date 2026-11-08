# Tenh Temp Mail

A standalone Next.js App Router application at **https://temp-mail.tenh-pos.com**, separate from the POS application. TypeScript, Tailwind CSS, Lucide icons, Khmer/English UI (Khmer by default), a light-only theme, and a sanitized email reader.

## Run locally

Use Node.js 24.15 or newer (Node 22.22.2+ is also supported by the sanitizer).

```powershell
cd C:\Users\TUF\pos-system\temp-mail
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open http://localhost:3001. Copy a generated address and send it an email from a real mailbox to test receipt and OTP extraction. There are no synthetic demo emails or demo controls.

```powershell
npm test
npm run lint
npm run typecheck
npm run build
npm start
```

Your address and language are saved locally. Incoming messages poll every four seconds while the tab is visible. First load uses an instant offline human name. **Random New Email** requests a name from `https://randomuser.me/api/?nat=us,gb,ca,au&inc=name`, with a two-second timeout and a local fallback of 25 first names and 25 last names. Names use `firstname.lastname10`–`firstname.lastname99`. The button stays disabled with a spinner for at least two seconds. The external request sends no inbox address or message content; the provider sees the visitor's connection metadata. A browser cooldown is not a server-side bot control. Realistic names do not guarantee acceptance by other websites or bypass their disposable-email rules. Editing the username or domain switches inboxes without deleting the previous one.

## Storage and deployment

The requested `globalThis.__emailStore` survives hot reloads in a **single Node process**. A one-minute cleanup timer and read-time expiry remove messages older than 60 minutes. Retention is bounded to **20 messages per inbox and 2,000 messages globally in memory**. The oldest timestamps are evicted first. Restarts erase memory. This mode is suitable for local testing or one persistent server, with that limitation disclosed to users.

**Vercel/serverless production requires shared storage.** Connect Upstash for Redis through Vercel Marketplace, which supplies `KV_REST_API_URL` and `KV_REST_API_TOKEN`. Direct provider accounts can instead set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`; both naming schemes are supported. The app uses the Redis REST API directly, with atomic insertion, retry deduplication, per-message expiry, per-inbox expiry, and a **20-message inbox cap**. The 2,000-message global cap applies to process memory. No POS database or POS credentials are used. GET/DELETE storage failures return 503; there is no silent memory fallback when Redis is configured. On Vercel, real webhook delivery returns 503 until Redis is configured. The UI displays a setup notice until delivery is available.

Validated webhooks return `200 {"status":"ok"}` before writing messages using Next.js `after()`. Background storage failures produce a generic server error log with no message contents or credentials. **A 200 acknowledges receipt, not durable storage: later storage failure cannot cause an ImprovMX retry.** Monitor this log if immediate acknowledgement is enabled.

For Vercel, deploy this folder as its own project (`tenh-temp-mail`), framework **Next.js**, Node **24.x** or another supported Node release, and attach **temp-mail.tenh-pos.com**. When deploying from the monorepo Git repository, set the project's Root Directory to `temp-mail`. The root POS TypeScript and ESLint checks exclude this independent app; run its checks separately. Use only this folder's source and lockfile when deploying directly. Never upload `.env.local`, `.vercel`, `node_modules`, or local build output as source files.

For a persistent Node host, build and run `npm start` behind an HTTPS reverse proxy for `temp-mail.tenh-pos.com`. Set the same webhook secret. Without Redis, run exactly one process. `output: "standalone"` also produces a minimal server; copy `.next/static` to `.next/standalone/.next/static` before running `node .next/standalone/server.js`.

## ImprovMX: configure all five receiving domains

Supported receiving domains:

1. `loeuklabs.site`
2. `mekhalatech.site`
3. `tumnob.site`
4. `helenbl.site`
5. `honey-wellaerospace.site`

These are **receiving domains**, distinct from the web app hostname. Listing them in this app does not prove ownership or configure email routing. You need authorized DNS and ImprovMX access for each.

1. Add each domain to your ImprovMX account with a plan that supports webhook forwarding. Follow that domain's current **DNS settings** in the ImprovMX console. Configure its MX and verification/SPF records at the authoritative DNS provider. Preserve unrelated DNS records and merge SPF rules rather than creating multiple SPF records. Do not change `tenh-pos.com` MX records for this app.
2. Generate a long random webhook secret locally:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

3. Set that value as the server-only `WEBHOOK_SECRET` in `.env.local` and/or the **tenh-temp-mail** project's Production and Preview environment variables. Never prefix secrets with `NEXT_PUBLIC_`. Redeploy after configuring environment variables. `IMPROVMX_WEBHOOK_SECRET` remains a legacy fallback when `WEBHOOK_SECRET` is empty. If both variables are empty, POST authentication is disabled, as requested for initial setup; set a secret before public use. `WEBHOOK_SECRET` takes precedence, so migrate existing destinations to the same value before changing it.
4. For **each of the five domains**, open **Aliases**, add or edit alias **`*`**, and set its forwarding destination to:

   ```text
   https://temp-mail.tenh-pos.com/api/webhook/improvmx?secret=YOUR_RANDOM_SECRET&attachments=false
   ```

   `attachments=false` prevents unused attachment data from filling the webhook body. Keep spam filtering enabled. The URL contains a secret; do not publish it or paste it into tickets. Requests sent by your own integrations can instead supply `x-webhook-secret: YOUR_RANDOM_SECRET`. Legacy `?token=...` and `Authorization: Bearer ...` are also accepted against the active secret.
5. Save the alias, confirm the domain's MX status, and use ImprovMX's **TEST** button. The test recipient must use a supported receiving domain. Then copy an address from the app and send a real verification message to it.
6. Confirm that the email appears and its OTP can be copied. A successful POST returns `200` with `{"status":"ok"}`. An incorrect or missing secret returns `401` when authentication is configured. Every envelope recipient must belong exactly to the five-domain whitelist; foreign domains (including subdomains and mixed allowed/foreign recipients) return `403`. Malformed fields return `400`; non-JSON requests return `415`. Each HTML/text field is truncated at **200 KiB (204,800 bytes)** without splitting UTF-8 characters; attachment fields are never stored. A hard **1 MiB** streamed request limit discards oversized spam and returns `200` to prevent retries. Such discarded payloads never reach storage. The route supports ImprovMX's `{to: [{email}], from: {email}}` format, `Delivered-To`, simple `recipient`/`sender` fields, seconds/milliseconds/ISO timestamps, and provider message IDs for deduplication.

### MX, SPF, DMARC, and white-label receiving hosts

For **each of the five receiving domains**, use these DNS records unless the ImprovMX console supplies different account-specific MX targets. Do not modify the web app domain's mail records.

| Type | Host | Priority | Value |
| --- | --- | --- | --- |
| MX | `@` | 10 | `mx1.improvmx.com` |
| MX | `@` | 20 | `mx2.improvmx.com` |
| TXT | `@` | — | `v=spf1 include:spf.improvmx.com ~all` |
| TXT | `_dmarc` | — | `v=DMARC1; p=none;` |

Maintain **one** SPF TXT record per domain. Merge the ImprovMX include into an existing SPF policy before its final `~all`/`-all`; keep authorized existing senders. Keep a single DMARC policy and preserve any existing reporting settings. `p=none` monitors mail and does not enforce rejection. SPF and DMARC authenticate sending; they do not guarantee OTP delivery or disposable-domain reputation.

For **White-Label MX**, first enable white-label receiving in the provider account and obtain its approved branded MX hostnames and DNS instructions. Publish the required A/AAAA records for those receiving hosts using the provider's supplied addresses, then replace the two MX targets above with those approved hosts at priorities 10 and 20. **Do not point MX to this Next.js/Vercel web app, invent static provider IPs, or use a CNAME as an MX target.** If your plan does not offer supported white-label receiving hosts, retain the standard ImprovMX MX records. Check MX status in ImprovMX after DNS propagation and test all five catch-alls. Branding the web app is separate from white-label SMTP receiving.

Existing named ImprovMX aliases take precedence over `*`. Those reserved usernames continue using their own destinations; use a generated address for the public inbox. Configure each catch-all to forward only to this webhook if you want to avoid retaining copies in a personal mailbox.

Official provider reference: https://improvmx.com/guides/webhooks/. ImprovMX treats 2xx as successful delivery and retries failed requests a limited number of times. Configure storage and authentication before forwarding real messages. Verify MX routing and OTP extraction with real delivery tests.

## Live Domain Deliverability Status

The dashboard checks the five fixed receiving domains through Google Public DNS over HTTPS. `/api/domains/status` checks MX targets against ImprovMX, verifies a single SPF record includes ImprovMX, and checks for a single DMARC policy with `p=none`, `quarantine`, or `reject`. DNS results are cached for 60 seconds per running instance, concurrent lookups are combined, and each upstream request has a four-second timeout. Missing records appear separately from unavailable DNS lookups. The endpoint shares the existing 30-request/minute/IP limit with inbox polling.

After a successful webhook storage write, the app records the domain's last receipt timestamp in shared Redis, retaining only that timestamp for seven days. Local memory mode retains the same bounded five-domain metadata until restart. No address, sender, subject, OTP, or message body appears in this status response. Receipt tracking starts with new deliveries after this update; old inbox messages are not treated as new receipts. A DNS refresh does not send email or create ad impressions.

The UI refreshes status once a minute while visible, supports manual checks, and lets a user select a receiving domain from its card. These checks show DNS readiness and recent receipt activity; they do not prove that other websites accept the address, that a domain is absent from disposable-email blocklists, or that every sender will deliver. A published `p=none` DMARC record is a monitoring policy. Backend storage failure and lookup failure are shown explicitly rather than reported as a pass.

## Inbox API

All methods use `/api/webhook/improvmx`, disable caching, and normalize supported recipient addresses to lowercase.

GET and DELETE share a **30 requests/minute/IP** fixed window, returning `429` with `Retry-After` when exceeded. Expired windows are removed and at most 10,000 IP buckets are retained. This lightweight in-memory limit is per process; multiple tabs on one IP share it, and distributed serverless instances do not share counters. For global DDoS/scraping protection, enforce limits with a shared store or edge firewall. On Vercel the route uses `x-vercel-forwarded-for`; on a persistent host your reverse proxy must overwrite `x-forwarded-for`, rather than trusting client-supplied IPs.

| Method | Request | Result |
| --- | --- | --- |
| POST | Authenticated provider JSON | Stores email and extracts 4–8 digit OTP |
| GET | `?email=hello@loeuklabs.site` | `{ emails, deliveryReady }`, newest first |
| DELETE | `?email=hello@loeuklabs.site` | Clears that public inbox; `{ cleared: true }` |

Inboxes are intentionally public: knowing an address allows reading and deletion. This is not private authenticated email. Never use it for banking, account recovery, or confidential information. HTML is sanitized to text and safe formatting; scripts, attributes, forms, links, styles, and remote images are removed. Nothing from a received message is used as an ad script. Provider receipt times are clamped to the present, and expired messages are not resurfaced. Operational provider logs are outside the 60-minute inbox retention policy.

## Public status and admin diagnostics

Public domain cards show only Verified, Not verified or Down. Detailed MX, SPF, DMARC, storage health and recent receipt times are available to signed-in Super Admins under **Temp** at `https://admin.tenh-pos.com/super-admin/temp` (the existing admin host redirects to `app.tenh-pos.com`). The admin action checks Super Admin access before fetching the report. The status API contains public DNS records and receipt timestamps, never inbox addresses or email contents.

DNS checks refresh every minute. Google DNS is tried first; Cloudflare DNS is a bounded fallback for empty or unavailable results, including cached NXDOMAIN after new records are published. A green card still requires valid MX, SPF and DMARC records plus working inbox storage. Failed refreshes never retain a green verification badge.

## Ads

Adsterra website **6182414** is approved for `temp-mail.tenh-pos.com`. Adult ads are disabled. Six active units are installed:

| Placement | Adsterra unit | Size |
| --- | --- | --- |
| Desktop leaderboard | 32141336 | 728×90 |
| Mobile leaderboard | 32141337 | 320×50 |
| Inbox column | 32141338 | 300×250 |
| Native widget | 32142139 | Responsive |
| Gemini left sidebar | 32159027 | 160×600 |
| Gemini right sidebar | 32159028 | 160×300 |

The two Gemini units run once per page visit in separate `public/ads/sidebar-600.html` and `sidebar-300.html` documents. They load only when the initial viewport is at least 1280px wide, stay beside the article, and hide below that width without replacing frames. A phone visit loads neither sidebar unit; expanding that visit to desktop requires a new navigation to load them. Short desktop windows use normal scrolling instead of sticky positioning. No refresh timer or ad click is added. Revenue depends on genuine traffic and advertiser demand; active units do not guarantee earnings.

`AdSlot` is memoized and embeds a fixed frame on the separate `https://tenh-temp-mail.vercel.app` origin. The approved tags run inside `public/ads/leaderboard.html` and `public/ads/inbox.html`, never in the inbox document. Both iframe attributes and HTTP CSP sandbox allow scripts and their own origin because Adsterra writes into a nested frame. Browser origin isolation prevents access to the Temp Mail document and its local storage; the app passes no inbox addresses, messages or OTPs to the ads. Ad URLs on the main domain redirect to the separate origin. Referrers expose only origins. The rest of the app retains `X-Frame-Options: DENY`; ad documents use CSP to allow embedding by Temp Mail.

The leaderboard chooses one desktop or mobile tag at its initial load. It does not load a hidden second unit or change creatives on resize. `public/ads/fit.js` scales the existing creative down when its container is narrower than the approved banner width, including small phones; resizing never changes frame sources or reloads ad code. The inbox and message preview start on the same desktop row, with the 300×250 banner below the preview in the sticky reader column; mobile uses normal document flow. The native unit sits between the inbox application and the educational article. No sticky ad covers the page or its controls.

All ad frames mount only after hydration, and load independently of the main document. The shared banner loader creates an asynchronous provider script; the native tag uses the provider's approved async snippet. `report.js` observes actual creative content inside the isolated frame and sends only its height to the app. The app accepts readiness only from the expected origin and that slot's own frame, with bounded dimensions. Pending or blocked placements have zero height, margin and border. A 12-second fallback marks an unfilled slot unavailable without unmounting or retrying it. Loaded ads introduce their own space, so avoiding blank reserved space can cause layout movement as creatives arrive; no Core Web Vitals score is guaranteed.

The inbox banner stays outside the changing message reader. Polling does not change ad frame sources, append scripts, or trigger refresh timers. Language changes also preserve frame sources. `tests/ad-isolation.test.mjs` renders the real workspace and reader while simulating five polls, including message arrival and an empty inbox, and checks all three iframe nodes survive with no `src` or `srcdoc` changes. It also tests async tag selection, narrow-screen scaling, blocked states, readiness origin/source validation and content detection without live ad requests or impressions.

Privacy notices in Khmer and English disclose Adsterra and its processing. Provider privacy information: https://adsterra.com/privacy-policy-managed/. Ad blockers, provider review and available inventory can affect whether a creative appears. No ad clicks or automatic impression refresh are performed by this application.

The crawlable footer links to bilingual Privacy Policy, Terms, About, Abuse/Report, and Contact pages. Contact uses `support@tenh-pos.com`. The privacy policy distinguishes temporary message storage from application diagnostic logs and independent provider logs; it does not make an inaccurate blanket zero-logging claim.

## SEO and indexing

The homepage includes server-rendered educational content with more than 600 English words before the FAQ and more than 500 Khmer words measured with Unicode-aware `Intl.Segmenter`. The six FAQs appear in both languages, with an FAQPage schema matching their English questions and answers exactly. It remains readable by crawlers without JavaScript. Poppins renders English and Hanuman renders Khmer. The head contains bilingual description text, a canonical URL, OpenGraph and Twitter cards, a generated 1200×630 PNG, and a factual WebApplication JSON-LD entity. Language sections share one canonical URL; no nonexistent language routes or review ratings are advertised.

`/robots.txt` permits public-page crawling by all user agents and points to `/sitemap.xml`. Inbox API and ad documents are excluded from crawling. The sitemap lists eight URLs: the homepage, five information pages, `/guides/disposable-email-testing` and `/gemini`, with their content update dates. Every information page and guide has its own canonical metadata. Email addresses and inbox API URLs are never sitemap entries. Submit `https://temp-mail.tenh-pos.com/sitemap.xml` in the verified Google Search Console property, then inspect the homepage and guide URLs. Sitemap submission does not guarantee indexing, ranking or a particular CPM.

The Gemini header and footer links open `/gemini`, a server-rendered gallery of 11 owner-provided photos titled "Gemini AI Pro 12month & 24month". Uploaded images 2–12 appear in their original order under bold Step 1–11 headings; image 1 is only the header-placement reference. Images live under `public/gemini/photo-01.png` through `photo-11.png` and open at full size through Next.js Image. Payment-card identifiers in photos 6, 8 and 10 are redacted in the image assets themselves; the other originals remain unchanged. Normal Google account navigation and cautious cancellation guidance accompany the relevant photos. The displayed subscription includes a bundle, so the page does not claim that cancelling the whole subscription cancels only YouTube. No checkout-injection, false-billing or trial-stacking instructions are added, and offer availability is not verified.

Metadata and visible articles describe free temp mail, receiving OTP online, a 10 minute mail alternative, and temp mail in Cambodia without promising privacy the app does not offer. Google decides indexing and rankings. FAQPage markup does not guarantee a rich result; Google generally limits FAQ rich results to well-known authoritative government and health sites: https://developers.google.com/search/docs/appearance/structured-data/faqpage . Adsterra determines fill, CPM, advertiser selection and revenue. No top ranking or CPM increase is promised. No Google AdSense scripts, placeholder containers or fabricated publisher records are installed.

`tests/seo.test.mjs` checks substantial content in both languages, six matching schema questions, bilingual policy coverage, truthful privacy language, canonical metadata and public-only sitemap URLs. Browser checks on Windows use Chrome responsive viewports; they are not physical iPhone Safari or Android Chrome tests. A real-device testing service or those devices is required before claiming that coverage.

## Verification scope

`npm test` covers OTP context/leading zeroes, false positives, supported addresses, actual provider payloads, timestamps, TTL, sorting, recipient isolation, deletion, duplicate deliveries, webhook authentication, body limits, cross-origin deletion, the removed demo parameter, Redis failure behavior, and sanitizer restrictions. Real email delivery additionally requires a configured ImprovMX account, MX records, webhook secret, and shared storage on Vercel.

With a local file containing the real Redis variables, run the opt-in live storage check:

```powershell
node --env-file=.env.production.local --experimental-strip-types --test tests/redis.integration.test.mjs
```

That check creates a random test inbox, verifies concurrent insertion deduplication and the Redis TTL, and deletes its own data. Without Redis variables, it is skipped by `npm test`. Vercel cannot pull sensitive production secrets; do not leave a `WEBHOOK_SECRET="[SENSITIVE]"` or legacy placeholder overriding your local test secret after an environment pull.
