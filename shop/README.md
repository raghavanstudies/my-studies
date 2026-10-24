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
- Tests: `npm test` (32 checks, phone + desktop).

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
