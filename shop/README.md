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

The public site in `../peppynose/` is static GitHub Pages, so it cannot keep passwords. Customer accounts live in this Worker, in the same D1 database as the shop. Pages call `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/google`, `PUT /api/auth/profile`, `POST /api/auth/logout`, `POST /api/auth/delete`, `GET /api/auth/me` and `GET /api/auth/config`.

Why this and not a separate hosted login product: the Worker, D1, the admin session secret and the local test server were already here. Accounts reuse them. The static site only gets the forms and a header link.

How a password is stored: it is peppered with `SESSION_SECRET` (HMAC-SHA256), then hashed with PBKDF2-SHA256 at 100,000 iterations and a random salt. 100,000 is the highest count Cloudflare Workers will run. `AUTH_PBKDF2_ITERS` above that is refused with a clear error, not a 500. The count is stored in the hash (`pbkdf2-sha256$<count>$<salt>$<hash>`) so it can be raised later. The database never sees the password. The browser gets one cookie, `pn_session` (HttpOnly, SameSite=Lax, Secure on https and on localhost). The cookie value is random; the database stores only its SHA-256. A checked “Stay logged in on this device” box (the default) sets `Max-Age` to 30 days. An unchecked box omits `Max-Age`, so the browser drops the cookie when it closes. The database session still expires after 30 days either way. Logout and delete also need the CSRF token from `/api/auth/me`, sent as `x-csrf-token`. Saving details uses that token too. Login, sign-up, Google sign-in and profile save require JSON, so a plain cross-site form cannot submit them. If the browser sends `Origin`, it must be this host or a host listed in `AUTH_ORIGINS`. Failed logins are limited (8 per IP and 20 per identifier each 15 minutes). Google sign-in uses the same window (8 per IP each 15 minutes). Sign-ups are limited (10 per IP each hour).

Sign-up collects only a username (3–30 letters, digits, underscore or dot, unique, case-insensitive, not digits only), a password and a confirm password. Name, email and mobile are not on that form. After the first login, if `profile_complete` is still 0, the site opens `details.html`: name (required, 2–80 characters), email (required and validated) and an Indian mobile number (optional, 10 digits starting 6–9). Saving calls `PUT /api/auth/profile` and then returns to the safe `next` path, or that language’s home page. Duplicate username, mobile and email each return their own error. A Google-only account has no password hash until one is set, so delete (which asks for the password) does not apply to it yet.

Login accepts one field: username, mobile number or email, then the password. An `@` means email. A number (spaces, dashes, a leading `+91`, a 12-digit `91`, or an 11-digit leading `0` stripped) means a mobile if it becomes 10 digits starting 6–9. Anything else is a username. Username and email match case-insensitively. A wrong password and an unknown account both say `Invalid credentials.` so the form does not reveal which identifiers exist.

A visitor can skip login. That stores `pn_guest=1` (a normal cookie, plus localStorage and sessionStorage) and returns to a same-site `next` or `returnTo` path, or the referrer, or that language’s home page. An external `next` is ignored. The header still says Log in. The shop, cart and checkout are unchanged and do not require an account.

The English, Hindi and Tamil home pages (`/`, `/index.html`, `/hi/`, `/ta/`, and their `index.html` files) run `login-gate.js` in `<head>` before the page paints. A first visit goes to that language’s `login.html?next=` the home page. Skip login and a successful login both return there. A `pn_logged_in` hint (not the HttpOnly session cookie) skips the gate; `/api/auth/me` clears a stale hint. Other pages, including the shop, are not gated. Known crawlers are not redirected, so the home page can still be indexed. A crawler that does not match that list and runs JavaScript will see the login page instead.

Sign in with Google uses the Google Identity Services button on the login page. The browser posts the ID token to `POST /api/auth/google`. The Worker checks the signature against Google’s JWKS, then `aud`, `iss`, `exp` and `email_verified`. It finds or creates the account by Google’s `sub`. It does not attach that Google id to a password account that already uses the same email, because the details form does not prove the person owns the address. That person is asked to log in with the password instead. A different Google account on an email that is already linked is refused. If two sign-ins for the same Google account collide, the second one still logs in. The same session cookie is used, including the stay-logged-in choice. The button is shown only when `GET /api/auth/config` returns a `google_client_id`. That value is the public OAuth web client id in `wrangler.toml`:

`GOOGLE_CLIENT_ID` = `638977578641-7sh9ipk6l78netgnuq09g8gbsat94hd8.apps.googleusercontent.com`

It is not a secret. The authorised JavaScript origins on that client are `https://www.peppynose.com` and `https://peppynose.com`. Localhost is not one of them, so the Google button on this computer can render and still fail to complete a real Google sign-in. Do not put a client secret in git. Merging the website pages does not deploy the Worker. Deploy the Worker again before the live server uses the latest sign-in rules in `src/auth.js`.

The OTP routes (`POST /api/auth/otp/request` and `POST /api/auth/otp/verify`) are still in the Worker. The login page does not show them. `GET /api/auth/config` returns `{ "otp", "google_client_id" }`. `otp` is true only when a code can actually be sent for this request. The live default is false (`OTP_SMS_PROVIDER=off` and `OTP_EMAIL_PROVIDER=off`).

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

1. The D1 database is already named in `wrangler.toml`: `peppynose_shop`, binding `DB`, id `11cd4023-e14d-47ad-829e-0bc87f433607`. `wrangler dev --local` still uses a local database. This file does not deploy anything.
2. If that database already has shop tables, add the account tables (this does not delete orders). Run each file once, in order, and only the ones that database has not had yet:
   ```
   npx wrangler d1 execute peppynose_shop --remote --file=db/auth-migration.sql
   npx wrangler d1 execute peppynose_shop --remote --file=db/auth-migration-002.sql
   npx wrangler d1 execute peppynose_shop --remote --file=db/auth-migration-003.sql
   npx wrangler d1 execute peppynose_shop --remote --file=db/auth-migration-004.sql
   ```
   `auth-migration-002.sql` only adds `username` and `mobile` (`ALTER TABLE`) and the `auth_otps` table (`CREATE TABLE IF NOT EXISTS`), plus unique indexes. It does not drop anything. SQLite cannot add a column with `IF NOT EXISTS`; running those two `ALTER` lines again stops with "duplicate column name" and leaves the data as it is. Skip 002 if this database was created from an older `schema.sql` that already had those columns.
   `auth-migration-003.sql` rebuilds the `users` table so email, username, mobile, name and `password_hash` can be empty, and adds `google_sub` and `profile_complete`. Sessions stay. Existing rows that already have a name and an email are marked complete so those people are not sent to the details page. Run it once. A second run clears `google_sub`. Skip 003 if this database was created from the current `schema.sql` (it already has those columns). `auth-migration-004.sql` only adds `email_verified` (`ALTER TABLE`). Every existing email starts unverified. A Google sign-in marks its email verified; an email typed on the details page is unverified, so a Google sign-in for that address takes it off the other account (which is asked for its details again) instead of being refused. The two accounts are never linked. A second run stops with "duplicate column name" and changes nothing. Skip 004 if this database was created from the current `schema.sql`. Do not run `db/schema.sql` on a live database. It drops every shop table. A brand-new empty database can use `schema.sql` instead. This change does not run any of these files on the live database.
3. Deploy the Worker yourself to a new hostname such as `api.peppynose.com`. Add a DNS record for that hostname only. Leave the existing www / peppynose.com CNAME alone.
4. Set secrets on the Worker (not in git):
   - `SESSION_SECRET` — at least 32 random characters. The shop admin cookie already uses it. It also peppers customer passwords. If you change it later, every customer must set a new password (there is no automatic reset yet) and admin logins need the new secret too.
   - `ORDER_SECRET`, `ADMIN_PASSWORD` — already used by the shop.
   - `COOKIE_DOMAIN` — already `.peppynose.com` in `wrangler.toml` (note the leading dot) so the cookie is sent from www to the API. The Worker adds `Domain` only when the request host is under that name, so localhost keeps a host-only cookie.
   - `AUTH_ORIGINS` — already `https://www.peppynose.com,https://peppynose.com` in `wrangler.toml`.
   - `AUTH_PBKDF2_ITERS` — optional. The only accepted production value is 100000. Anything above 100000 is refused, because Workers cannot run it. Anything else is refused too. Leave it unset.
   - Never set `AUTH_TEST_FAST` on the Worker.
   - `GOOGLE_CLIENT_ID` — already set in `wrangler.toml` `[vars]` to the public client id `638977578641-7sh9ipk6l78netgnuq09g8gbsat94hd8.apps.googleusercontent.com`. It is not a secret. Authorised JavaScript origins: `https://www.peppynose.com` and `https://peppynose.com`. A deploy is what copies it onto the live Worker. This change does not deploy.
   - OTP delivery, one pair. The live values in `wrangler.toml` are `OTP_SMS_PROVIDER=off` and `OTP_EMAIL_PROVIDER=off`. Unset means the same thing: `off`. The login page does not offer a code. `dev` is not the default. It runs only when you set `OTP_SMS_PROVIDER=dev` and `OTP_EMAIL_PROVIDER=dev` yourself, and only for a request whose host is `localhost` or `127.0.0.1`. Do not set `dev` on the live Worker. Local Playwright sets those two to `dev` for the test server only.
     - Mobile: `OTP_SMS_PROVIDER=msg91` with `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID` and `MSG91_SENDER_ID`. The template must be DLT-registered and use MSG91’s OTP variable. Or `OTP_SMS_PROVIDER=twilio` with `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM`. In India the Twilio body must match your DLT template; set `TWILIO_OTP_BODY` to that exact text and put `{code}` where the digits go. If you omit it, the text is `Your Peppynose login code is 123456. It expires in 5 minutes.`
     - Email: `OTP_EMAIL_PROVIDER=resend` with `RESEND_API_KEY` and `OTP_EMAIL_FROM`. Or `OTP_EMAIL_PROVIDER=mailchannels` with `OTP_EMAIL_FROM` (the domain needs the MailChannels SPF/DKIM records). Or `OTP_EMAIL_PROVIDER=ses` with `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SES_REGION` and `OTP_EMAIL_FROM` (the address must be a verified SES identity).
     - Do not set either provider to `dev` on the live Worker. Do not put these secrets in git.
5. `peppynose/auth-config.js` already sets `window.PN_AUTH_API = "https://api.peppynose.com"`. On `localhost` and `127.0.0.1` that script clears it, so local tests call the same host. Publish the static site the way you already do when you want the live pages to use it. This change does not publish the site.

Forgot password is intentionally not built. The shop can store an email in `outbox` but nothing sends it. A reset link without real delivery would be unsafe. The login page asks people to email care.peppynose@gmail.com from the address on the account. Sign-up does not prove the person owns the email yet; add that when mail can actually be sent.

Hindi and Tamil: `/hi/login.html`, `/hi/signup.html`, `/hi/details.html`, `/hi/account.html`, and the same under `/ta/`. The header link uses those languages too. A native speaker should check the wording.
