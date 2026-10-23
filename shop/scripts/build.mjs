// Builds the LOCAL shop preview. Never touches ../peppynose (the live site source):
//  dist/      = a copy of the live site + the shop pages (/shop/…) + "Buy from Peppynose" buttons on the copy's Shop page
//  dist-db/   = seed.sql for the local database, made from data/catalogue.json
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const HERE = dirname(dirname(fileURLToPath(import.meta.url)));          // shop/
const SITE = join(HERE, '..', 'peppynose');
const DIST = join(HERE, 'dist'), DB = join(HERE, 'dist-db');
const C = JSON.parse(readFileSync(join(HERE, 'data', 'catalogue.json'), 'utf8'));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rupees = p => '₹' + (p / 100).toLocaleString('en-IN', { minimumFractionDigits: p % 100 ? 2 : 0 });

// ---- 1. copy the live site, then add the shop ----
rmSync(DIST, { recursive: true, force: true }); rmSync(DB, { recursive: true, force: true });
mkdirSync(DB, { recursive: true });
cpSync(SITE, DIST, { recursive: true });
cpSync(join(HERE, 'public'), DIST, { recursive: true });

// Header and footer come from the live Shop page, so the shop looks exactly like the site.
const live = readFileSync(join(SITE, 'products.html'), 'utf8');
const up = html => html.replace(/(href|src)="(?!https?:|mailto:|#|\/|data:)([^"]*)"/g, '$1="../$2"');   // /shop/x.html → ../
const header = up(live.match(/<header[\s\S]*?<\/header>/)[0]).replace(/ aria-current="page"/g, '');
const footer = up(live.match(/<footer[\s\S]*?<\/footer>/)[0]);
const fonts = (live.match(/<link[^>]*fonts\.googleapis\.com\/css2[^>]*>/g) || []).join('\n  ');

const page = (file, title, desc, main, extraHead = '') => writeFileSync(join(DIST, 'shop', file), `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <meta name="robots" content="noindex">
  <link rel="icon" href="../favicon.png" type="image/png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  ${fonts}
  <link rel="stylesheet" href="../styles.css">
  <link rel="stylesheet" href="shop.css">${extraHead}
</head>
<body class="shop">
${header}
<div class="shop-test" role="note">Test shop — no real orders or payments yet.</div>
<main class="shop-main">
${main}
</main>
${footer}
<script src="shop.js" defer></script>
</body>
</html>
`);

// Product pages: built from the catalogue (fast, readable without JavaScript); price and stock are refreshed live by shop.js.
for (const p of C.products) {
  const v0 = p.variants[0];
  const opts = p.variants.map((v, i) => `<label class="sh-opt"><input type="radio" name="sku" value="${esc(v.sku)}"${i ? '' : ' checked'}><span>${esc(v.label.en)}</span><b data-price="${esc(v.sku)}">${rupees(v.price)}</b></label>`).join('');
  const market = p.variants.filter(v => v.amazon || v.flipkart).length ? `<p class="sh-also">Also on <a href="${esc(v0.amazon)}" target="_blank" rel="noopener">Amazon.in</a>${v0.flipkart ? ` and <a href="${esc(v0.flipkart)}" target="_blank" rel="noopener">Flipkart</a>` : ''}.</p>` : '';
  page(`${p.slug}.html`, `${p.name.en} — Peppynose shop`, `Buy Peppynose ${p.name.en} directly from Peppynose.`, `
<div class="wrap sh-product" data-slug="${esc(p.slug)}">
  <figure class="sh-ph"><img src="../${esc(p.img)}" alt="${esc(p.alt.en)}" width="700" height="700"></figure>
  <div class="sh-info">
    <a class="sh-back" href="index.html">← All products</a>
    <h1>${esc(p.name.en)}</h1>
    <p class="sh-desc">${esc(p.desc.en)}</p>
    <form class="sh-buy" id="buy-form">
      <fieldset><legend>Choose a pack</legend>${opts}</fieldset>
      <div class="sh-qty"><label for="qty">Quantity</label><button type="button" data-step="-1" aria-label="One less">−</button><input id="qty" name="qty" type="number" min="1" max="10" value="1" inputmode="numeric"><button type="button" data-step="1" aria-label="One more">+</button></div>
      <p class="sh-stock" id="stock-note" aria-live="polite"></p>
      <button class="btn sh-add" type="submit">Add to cart</button>
      <p class="sh-added" id="added" role="status"></p>
    </form>
    <p class="sh-note">Price includes GST. Delivery charges are shown in the cart.</p>
    ${market}
  </div>
</div>`);
}

// Shop home: every product with its starting price.
const cards = C.categories.map(c => {
  const list = C.products.filter(p => p.category === c.id).map(p => {
    const from = Math.min(...p.variants.map(v => v.price));
    return `<a class="sh-card" href="${esc(p.slug)}.html"><img src="../${esc(p.img)}" alt="${esc(p.alt.en)}" width="700" height="700" loading="lazy"><span class="sh-card-name">${esc(p.name.en)}</span><span class="sh-card-price">${p.variants.length > 1 ? 'from ' : ''}<b data-from="${esc(p.slug)}">${rupees(from)}</b></span></a>`;
  }).join('');
  return `<section class="sh-cat"><h2>${esc(c.name.en)}</h2><div class="sh-grid">${list}</div></section>`;
}).join('\n');
page('index.html', 'Peppynose shop', 'Buy Peppynose products directly from Peppynose.', `
<div class="wrap"><div class="sh-head"><h1>Peppynose shop</h1><p>Order directly from us. Pay by UPI, card or net banking.</p></div>
${cards}</div>`);

page('cart.html', 'Your cart — Peppynose shop', 'Your Peppynose shopping cart.', `
<div class="wrap sh-narrow"><h1>Your cart</h1><div id="cart" aria-live="polite"><p>Loading…</p></div></div>`);

page('checkout.html', 'Checkout — Peppynose shop', 'Delivery details and payment.', `
<div class="wrap sh-narrow"><h1>Delivery details</h1>
<form id="checkout" class="sh-form" novalidate>
  <label>Full name<input name="name" autocomplete="name" required maxlength="80"></label>
  <label>Mobile number (10 digits)<input name="phone" type="tel" inputmode="numeric" autocomplete="tel-national" required maxlength="10"></label>
  <label>Email (for your receipt)<input name="email" type="email" autocomplete="email" required maxlength="120"></label>
  <label>House / flat, street<input name="address1" autocomplete="address-line1" required maxlength="120"></label>
  <label>Area, landmark (optional)<input name="address2" autocomplete="address-line2" maxlength="120"></label>
  <div class="sh-row"><label>Town / city<input name="city" autocomplete="address-level2" required maxlength="60"></label>
  <label>PIN code<input name="pincode" inputmode="numeric" autocomplete="postal-code" required maxlength="6"></label></div>
  <label>State<select name="state" required autocomplete="address-level1"><option value="">Choose your state</option></select></label>
  <div id="summary" class="sh-summary" aria-live="polite"></div>
  <p class="sh-err" id="err" role="alert"></p>
  <button class="btn sh-pay" type="submit">Continue to payment</button>
  <p class="sh-note">We use your details only to deliver this order and send your receipt.</p>
</form></div>`);

page('pay.html', 'Test payment — Peppynose shop', 'Test payment page.', `
<div class="wrap sh-narrow"><h1>Test payment</h1>
<div class="sh-mockpay"><p><b>This is a pretend payment page for testing.</b> No money is taken. In the real shop, Razorpay opens here (UPI, cards, net banking).</p>
<p id="pay-amount" class="sh-total"></p>
<button class="btn sh-pay" id="pay-ok" type="button">Pay (test: success)</button>
<button class="btn plain" id="pay-fail" type="button">Test: payment fails</button>
<p class="sh-err" id="err" role="alert"></p></div></div>`);

page('order.html', 'Your order — Peppynose shop', 'Order status.', `
<div class="wrap sh-narrow" id="order" aria-live="polite"><p>Loading…</p></div>`);

page('admin.html', 'Shop admin — Peppynose', 'Peppynose shop admin.', `
<div class="wrap" id="admin"><h1>Shop admin</h1>
<form id="login" class="sh-form sh-narrow" hidden><label>Admin password<input name="password" type="password" autocomplete="current-password" required></label><p class="sh-err" id="login-err" role="alert"></p><button class="btn" type="submit">Log in</button></form>
<div id="panel" hidden></div></div>`);

// Shop link + "Buy from Peppynose" buttons on the COPY of the Shop page only (the live site is not changed).
let prod = readFileSync(join(DIST, 'products.html'), 'utf8'), added = 0;
prod = prod.replace(/(<a class="pn-qr" href="buy\/([a-z0-9-]+)\.html")/g, (m, a, slug) => {
  if (!C.products.some(p => p.slug === slug)) return m;
  added++; return `<a class="btn sh-direct" href="shop/${slug}.html">Buy from Peppynose</a>` + a;
});
prod = prod.replace('</head>', '  <link rel="stylesheet" href="shop/shop.css">\n</head>');
writeFileSync(join(DIST, 'products.html'), prod);
if (added !== C.products.length) throw new Error(`added ${added} "Buy from Peppynose" buttons, expected ${C.products.length}`);

// ---- 2. seed data for the local database ----
const q = s => `'${String(s).replace(/'/g, "''")}'`;
const sql = ['-- generated by scripts/build.mjs from data/catalogue.json (TEST DATA)'];
C.products.forEach((p, i) => {
  sql.push(`INSERT INTO products (slug, category, data, gst_rate, hsn, gst_confirmed, weight_g, sort) VALUES (${q(p.slug)}, ${q(p.category)}, ${q(JSON.stringify({ name: p.name, desc: p.desc, alt: p.alt, img: p.img }))}, ${p.gst_rate}, ${q(p.hsn)}, ${p.gst_confirmed ? 1 : 0}, ${p.weight_g}, ${i});`);
  p.variants.forEach((v, j) => sql.push(`INSERT INTO variants (sku, product_slug, label, price, stock, amazon, flipkart, sort) VALUES (${q(v.sku)}, ${q(p.slug)}, ${q(JSON.stringify(v.label))}, ${v.price}, ${v.stock}, ${q(v.amazon || '')}, ${q(v.flipkart || '')}, ${j});`));
});
const settings = {
  shipping_fee: '4900', free_shipping_above: '49900',          // TEST values: ₹49 delivery, free from ₹499 (owner to decide)
  seller_name: 'Peppynose', seller_address: '8/3, Pari Vallal Street, T-pet Road, Musiri, Tiruchirappalli, Tamil Nadu - 621211', seller_state: 'Tamil Nadu',
  seller_gstin: '33DQIPM3353P1ZD', seller_email: 'care.peppynose@gmail.com', next_order_number: '1001'
};
for (const [k, v] of Object.entries(settings)) sql.push(`INSERT INTO settings (key, value) VALUES (${q(k)}, ${q(v)});`);
writeFileSync(join(DB, 'seed.sql'), sql.join('\n') + '\n');

// ---- 3. local secrets (only for this computer; never committed) ----
const vars = join(HERE, '.dev.vars');
if (!existsSync(vars)) writeFileSync(vars, `PAYMENT_MODE=mock\nADMIN_PASSWORD=${randomBytes(9).toString('base64url')}\nSESSION_SECRET=${randomBytes(32).toString('hex')}\nORDER_SECRET=${randomBytes(32).toString('hex')}\n`);
console.log(`built dist/ (${C.products.length} product pages) and dist-db/seed.sql`);
