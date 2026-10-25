# Peppynose own shop — LOCAL test version

This folder is a test shop that runs only on your own computer. It does **not** change www.peppynose.com:
the live site is `../peppynose/`, and this folder only reads it (makes a copy into `dist/`).

## Run it
```
cd shop
npm install
npm run dev          # builds, makes a fresh test database, starts http://localhost:8787
```
- Shop: http://localhost:8787/shop/  (also "Buy from Peppynose" buttons on http://localhost:8787/products.html)
- Admin: http://localhost:8787/shop/admin.html — the password is `ADMIN_PASSWORD` in `shop/.dev.vars`
  (made automatically on first build, random, never committed).
- Tests: `npm test` (account API unit tests, then the shop and account checks in a phone browser and a desktop browser).

## How it works
- `data/catalogue.json` — 12 products (LCD tablet removed 24 Oct 2026), prices in paise (₹249 = 24900), stock 25 each (test).
- `scripts/build.mjs` — copies the live site into `dist/`, adds the shop pages, writes `dist-db/seed.sql`.
- `src/worker.js` — the server (Cloudflare Worker): prices every cart itself, takes stock once per paid order,
  makes the GST invoice (Tamil Nadu: CGST + SGST, other states: IGST), runs the admin.
- `db/schema.sql` — the database tables (Cloudflare D1 / SQLite).
- `public/shop/` — shop.js and shop.css used by the shop pages.

## Test-only things to decide before going live
- Payment is a pretend page (`PAYMENT_MODE=mock`). Razorpay is ready in the code; it needs Razorpay keys
  (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`) and `PAYMENT_MODE=razorpay`.
- Delivery ₹49, free from ₹499 — test values.
- HSN, MRP, net quantity, origin and weight come from Seller Central (23 Oct 2026). GST rate 18% for every product (confirmed by the owner, 24 Oct 2026). The LCD tablet is not sold in the shop. BIS: not needed for teethers, kitchen set, foam mat (owner, 24 Oct 2026). Knee pad importer address: none given (owner).
- Emails are only saved (admin → Messages), not sent yet.
- Tamil (/ta/shop/) and Hindi (/hi/shop/) pages: text is in `data/shop-strings.json` — needs a native-speaker check. Emails and the invoice are still English.

## Accounts (log in / sign up)

The public site in `../peppynose/` is static GitHub Pages, so it cannot keep passwords. Customer accounts live in this Worker, in the same D1 database as the shop. Pages call `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/delete` and `GET /api/auth/me`.

Why this and not a separate hosted login product: the Worker, D1, the admin session secret and the local test server were already here. Accounts reuse them. The static site only gets the forms and a header link.

How a password is stored: it is peppered with `SESSION_SECRET` (HMAC-SHA256), then hashed with PBKDF2-SHA256 (600,000 iterations, random salt). The database never sees the password. The browser gets one cookie, `pn_session` (HttpOnly, SameSite=Lax, Secure on https and on localhost). The cookie value is random; the database stores only its SHA-256. Logout and delete also need the CSRF token from `/api/auth/me`, sent as `x-csrf-token`. Login and sign-up require JSON, so a plain cross-site form cannot submit them. If the browser sends `Origin`, it must be this host or a host listed in `AUTH_ORIGINS`. Failed logins are limited (8 per IP and 20 per identifier each 15 minutes). Sign-ups are limited (10 per IP each hour).

Sign-up collects name, username (3–30 letters, digits, underscore or dot, unique, case-insensitive, not digits only), a 10-digit Indian mobile number (unique), email (unique and required), password and confirm password. Email stays required because the existing `users.email` column is `NOT NULL`; making it optional would mean rebuilding the table, and the live migration must not drop or rebuild anything. Duplicate username, mobile and email each return their own error.

Login accepts one field: username, mobile number or email, then the password. An `@` means email. A number (spaces, dashes, a leading `+91`, a 12-digit `91`, or an 11-digit leading `0` stripped) means a mobile if it becomes 10 digits starting 6–9. Anything else is a username. Username and email match case-insensitively. A wrong password and an unknown account both say `Invalid credentials.` so the form does not reveal which identifiers exist.

A visitor can skip login. That stores `pn_guest=1` (a normal cookie, plus localStorage and sessionStorage) and returns to a same-site `next` or `returnTo` path, or the referrer, or that language’s home page. An external `next` is ignored. The header still says Log in. The shop, cart and checkout are unchanged and do not require an account.

Log in with OTP (mobile or email only; a username keeps the button disabled): `POST /api/auth/otp/request` then `POST /api/auth/otp/verify` with the 6-digit code. The code is random, stored only as an HMAC with `SESSION_SECRET`, expires in 5 minutes, works once, and locks after 5 wrong tries. Requests are limited (8 per IP and 5 per mobile or email each 15 minutes). The request always answers `If an account exists, we sent a code.` The page waits 30 seconds before resend. A successful code creates the same `pn_session` as a password login.

This is separate from the shop admin password (`ADMIN_PASSWORD` / `pn_admin`).

### Run it on this computer
```
cd shop
npm install
npm test             # unit tests, then Playwright (sign-up, log in, log out, delete)
npm run test:unit    # API tests only
npm run dev          # http://localhost:8787/login.html
```
`npm run dev` creates `shop/.dev.vars` if it is missing (`SESSION_SECRET`, `ORDER_SECRET`, `ADMIN_PASSWORD`). That file is gitignored. Do not commit it. Do not set `AUTH_TEST_FAST` in it: that weakens password hashing and is only for the unit tests.

### What you must do before it works on www.peppynose.com
Nothing here is deployed by this change. The www CNAME stays on GitHub Pages. Do not put real secrets in the repo.

1. Create the D1 database if the shop does not have one yet, and put its id in `wrangler.toml` (`database_id`). The id in the file today is a local placeholder.
2. If that database already has shop tables, add only the account tables (this does not delete orders). Run the first file once, then the second once:
   ```
   npx wrangler d1 execute peppynose_shop --remote --file=db/auth-migration.sql
   npx wrangler d1 execute peppynose_shop --remote --file=db/auth-migration-002.sql
   ```
   `auth-migration-002.sql` only adds `username` and `mobile` (`ALTER TABLE`) and the `auth_otps` table (`CREATE TABLE IF NOT EXISTS`), plus unique indexes. It does not drop anything. SQLite cannot add a column with `IF NOT EXISTS`; running those two `ALTER` lines again stops with "duplicate column name" and leaves the data as it is. Skip 002 if this database was created from the current `schema.sql` (it already has the columns). Do not run `db/schema.sql` on a live database. It drops every shop table. A brand-new empty database can use `schema.sql` instead.
3. Deploy the Worker yourself to a new hostname such as `api.peppynose.com`. Add a DNS record for that hostname only. Leave the existing www / peppynose.com CNAME alone.
4. Set secrets on the Worker (not in git):
   - `SESSION_SECRET` — at least 32 random characters. The shop admin cookie already uses it. It also peppers customer passwords. If you change it later, every customer must set a new password (there is no automatic reset yet) and admin logins need the new secret too.
   - `ORDER_SECRET`, `ADMIN_PASSWORD` — already used by the shop.
   - `COOKIE_DOMAIN` — `.peppynose.com` (note the leading dot) so the cookie is sent from www to the API. Both names must be under peppynose.com. Leave it unset for localhost.
   - `AUTH_ORIGINS` — `https://www.peppynose.com,https://peppynose.com`
   - `AUTH_PBKDF2_ITERS` — optional. Default is 600000. Anything lower is refused.
   - Never set `AUTH_TEST_FAST` on the Worker.
   - OTP delivery, one pair. Leave both unset for local development: that is `dev` mode. Dev mode returns the code only to localhost tests. It refuses to run when the request host or `Origin` is `peppynose.com` or any subdomain, so the live site cannot leak codes if these are forgotten.
     - Mobile: `OTP_SMS_PROVIDER=msg91` with `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID` and `MSG91_SENDER_ID`. The template must be DLT-registered and use MSG91’s OTP variable. Or `OTP_SMS_PROVIDER=twilio` with `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM`. In India the Twilio body must match your DLT template; set `TWILIO_OTP_BODY` to that exact text and put `{code}` where the digits go. If you omit it, the text is `Your Peppynose login code is 123456. It expires in 5 minutes.`
     - Email: `OTP_EMAIL_PROVIDER=resend` with `RESEND_API_KEY` and `OTP_EMAIL_FROM`. Or `OTP_EMAIL_PROVIDER=mailchannels` with `OTP_EMAIL_FROM` (the domain needs the MailChannels SPF/DKIM records). Or `OTP_EMAIL_PROVIDER=ses` with `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SES_REGION` and `OTP_EMAIL_FROM` (the address must be a verified SES identity).
     - Do not set either provider to `dev` on the live Worker. Do not put these secrets in git.
5. In `peppynose/auth-config.js` set `window.PN_AUTH_API = "https://api.peppynose.com";` and publish the static site the way you already do. Until that line is set, the pages call the same host. On GitHub Pages that host has no API, and the form says accounts are not connected yet.

Forgot password is intentionally not built. The shop can store an email in `outbox` but nothing sends it. A reset link without real delivery would be unsafe. The login page asks people to email care.peppynose@gmail.com from the address on the account. Sign-up does not prove the person owns the email yet; add that when mail can actually be sent.

Hindi and Tamil: `/hi/login.html`, `/hi/signup.html`, `/hi/account.html`, and the same under `/ta/`. The header link uses those languages too. A native speaker should check the wording.
