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

How a password is stored: it is peppered with `SESSION_SECRET` (HMAC-SHA256), then hashed with PBKDF2-SHA256 (600,000 iterations, random salt). The database never sees the password. The browser gets one cookie, `pn_session` (HttpOnly, SameSite=Lax, Secure on https and on localhost). The cookie value is random; the database stores only its SHA-256. Logout and delete also need the CSRF token from `/api/auth/me`, sent as `x-csrf-token`. Login and sign-up require JSON, so a plain cross-site form cannot submit them. If the browser sends `Origin`, it must be this host or a host listed in `AUTH_ORIGINS`. Failed logins are limited (8 per IP and 20 per email each 15 minutes). Sign-ups are limited (10 per IP each hour).

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
2. If that database already has shop tables, add only the account tables (this does not delete orders):
   ```
   npx wrangler d1 execute peppynose_shop --remote --file=db/auth-migration.sql
   ```
   Do not run `db/schema.sql` on a live database. It drops every shop table. A brand-new empty database can use `schema.sql` instead.
3. Deploy the Worker yourself to a new hostname such as `api.peppynose.com`. Add a DNS record for that hostname only. Leave the existing www / peppynose.com CNAME alone.
4. Set secrets on the Worker (not in git):
   - `SESSION_SECRET` — at least 32 random characters. The shop admin cookie already uses it. It also peppers customer passwords. If you change it later, every customer must set a new password (there is no automatic reset yet) and admin logins need the new secret too.
   - `ORDER_SECRET`, `ADMIN_PASSWORD` — already used by the shop.
   - `COOKIE_DOMAIN` — `.peppynose.com` (note the leading dot) so the cookie is sent from www to the API. Both names must be under peppynose.com. Leave it unset for localhost.
   - `AUTH_ORIGINS` — `https://www.peppynose.com,https://peppynose.com`
   - `AUTH_PBKDF2_ITERS` — optional. Default is 600000. Anything lower is refused.
   - Never set `AUTH_TEST_FAST` on the Worker.
5. In `peppynose/auth-config.js` set `window.PN_AUTH_API = "https://api.peppynose.com";` and publish the static site the way you already do. Until that line is set, the pages call the same host. On GitHub Pages that host has no API, and the form says accounts are not connected yet.

Forgot password is intentionally not built. The shop can store an email in `outbox` but nothing sends it. A reset link without real delivery would be unsafe. The login page asks people to email care.peppynose@gmail.com from the address on the account. Sign-up does not prove the person owns the email yet; add that when mail can actually be sent.

Hindi and Tamil: `/hi/login.html`, `/hi/signup.html`, `/hi/account.html`, and the same under `/ta/`. The header link uses those languages too. A native speaker should check the wording.
