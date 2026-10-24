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
const SELLER_ADDRESS = '8/3, Pari Vallal Street, T-pet Road, Musiri, Tiruchirappalli, Tamil Nadu - 621211';
const rupees = p => '₹' + (p / 100).toLocaleString('en-IN', { minimumFractionDigits: p % 100 ? 2 : 0 });

// ---- 1. copy the live site, then add the shop ----
rmSync(DIST, { recursive: true, force: true }); rmSync(DB, { recursive: true, force: true });
mkdirSync(DB, { recursive: true });
cpSync(SITE, DIST, { recursive: true });
cpSync(join(HERE, 'public'), DIST, { recursive: true });

// Shop pages in English (/shop/), Tamil (/ta/shop/) and Hindi (/hi/shop/). Text lives in data/shop-strings.json.
const STR = JSON.parse(readFileSync(join(HERE, 'data', 'shop-strings.json'), 'utf8'));
const LANGS = ['en', 'ta', 'hi'];
const fill = (s, o) => s.replace(/\{(\w+)\}/g, (m, k) => (k in o ? o[k] : m));
const up = html => html.replace(/(href|src)="(?!https?:|mailto:|#|\/|data:)([^"]*)"/g, '$1="../$2"');   // page moves one folder down: x.html → ../x.html

for (const L of LANGS) {
  const T = STR[L], R = L === 'en' ? '../' : '../../';   // R = from a shop page back to the site root
  const src = L === 'en' ? SITE : join(SITE, L), out = L === 'en' ? join(DIST, 'shop') : join(DIST, L, 'shop');
  mkdirSync(out, { recursive: true });
  // Header and footer come from the live Shop page of the same language, so the shop looks exactly like the site.
  const live = readFileSync(join(src, 'products.html'), 'utf8');
  const header = up(live.match(/<header[\s\S]*?<\/header>/)[0]).replace(/ aria-current="page"/g, '');
  const footer = up(live.match(/<footer[\s\S]*?<\/footer>/)[0]);
  const fonts = (live.match(/<link[^>]*fonts\.googleapis\.com\/css2[^>]*>/g) || []).join('\n  ');
  const js = JSON.stringify({ ...T, lang: L, root: R }).replace(/</g, '\\u003c');
  const n = o => o[L] || o.en;

  const page = (file, title, desc, main) => {
    const langs = LANGS.map(x => x === L   // same page in the other languages
      ? `<span aria-current="true">${STR[x].lang_name}</span>`
      : `<a href="${R}${x === 'en' ? '' : x + '/'}shop/${file}" lang="${x}" hreflang="${x}">${STR[x].lang_name}</a>`).join('');
    writeFileSync(join(out, file), `<!doctype html>
<html lang="${L}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <meta name="robots" content="noindex">
  <link rel="icon" href="${R}favicon.png" type="image/png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  ${fonts}
  <link rel="stylesheet" href="${R}styles.css">
  <link rel="stylesheet" href="${R}shop/shop.css">
</head>
<body class="shop">
${header}
<div class="shop-test" role="note">${esc(T.test_banner)}</div>
${file === 'admin.html' ? '' : `<nav class="wrap sh-langs" aria-label="Language">${langs}</nav>`}
<main class="shop-main">
${main}
</main>
${footer}
<script>window.PN_SHOP_T = ${js};</script>
<script src="${R}shop/shop.js" defer></script>
</body>
</html>
`);
  };

  // Product pages: built from the catalogue (fast, readable without JavaScript); price and stock are refreshed live by shop.js.
  for (const p of C.products) {
    const v0 = p.variants[0];
    const qty = v => (v.net_qty === v.label.en ? n(v.label) : v.net_qty);
    const opts = p.variants.map((v, i) => `<label class="sh-opt"><input type="radio" name="sku" value="${esc(v.sku)}"${i ? '' : ' checked'}><span>${esc(n(v.label))}</span>${v.mrp > v.price ? `<s class="sh-mrp">${esc(fill(T.mrp, { p: rupees(v.mrp) }))}</s>` : ''}<b data-price="${esc(v.sku)}">${rupees(v.price)}</b></label>`).join('');
    // Details the law asks a shop to show: MRP, net quantity, country of origin, who markets it.
    const details = `<details class="sh-details"><summary>${esc(T.details)}</summary><dl>
      <dt>${esc(T.net_qty)}</dt><dd>${p.variants.map(v => p.variants.length > 1 && qty(v) !== n(v.label) ? `${esc(n(v.label))}: ${esc(qty(v))}` : esc(qty(v))).join('<br>')}</dd>
      <dt>${esc(T.origin)}</dt><dd>${esc(T['country_' + p.origin] || p.origin)}</dd>
      <dt>${esc(T.marketed_by)}</dt><dd>${esc(p.manufacturer)}, ${esc(SELLER_ADDRESS)}</dd>
    </dl><p class="sh-note">${esc(T.mrp_note)}</p></details>`;
    const links = [v0.amazon && `<a href="${esc(v0.amazon)}" target="_blank" rel="noopener">Amazon.in</a>`, v0.flipkart && `<a href="${esc(v0.flipkart)}" target="_blank" rel="noopener">Flipkart</a>`].filter(Boolean);
    const market = links.length ? `<p class="sh-also">${fill(esc(T.also_on), { links: links.join(` ${esc(T.and)} `) })}</p>` : '';
    page(`${p.slug}.html`, `${n(p.name)} — ${T.shop_title}`, T.shop_desc, `
<div class="wrap sh-product" data-slug="${esc(p.slug)}">
  <figure class="sh-ph"><img src="${R}${esc(p.img)}" alt="${esc(n(p.alt))}" width="700" height="700"></figure>
  <div class="sh-info">
    <a class="sh-back" href="index.html">${esc(T.back_all)}</a>
    <h1>${esc(n(p.name))}</h1>
    <p class="sh-desc">${esc(n(p.desc))}</p>
    <form class="sh-buy" id="buy-form">
      <fieldset><legend>${esc(T.choose_pack)}</legend>${opts}</fieldset>
      <div class="sh-qty"><label for="qty">${esc(T.qty)}</label><button type="button" data-step="-1" aria-label="${esc(T.one_less)}">−</button><input id="qty" name="qty" type="number" min="1" max="10" value="1" inputmode="numeric"><button type="button" data-step="1" aria-label="${esc(T.one_more)}">+</button></div>
      <p class="sh-stock" id="stock-note" aria-live="polite"></p>
      <button class="btn sh-add" type="submit">${esc(T.add_to_cart)}</button>
      <p class="sh-added" id="added" role="status"></p>
    </form>
    <p class="sh-note">${esc(T.price_note)}</p>
    ${details}
    ${market}
  </div>
</div>`);
  }

  // Shop home: every product with its starting price.
  const cards = C.categories.map(c => {
    const list = C.products.filter(p => p.category === c.id).map(p => {
      const price = `<b data-from="${esc(p.slug)}">${rupees(Math.min(...p.variants.map(v => v.price)))}</b>`;
      return `<a class="sh-card" href="${esc(p.slug)}.html"><img src="${R}${esc(p.img)}" alt="${esc(n(p.alt))}" width="700" height="700" loading="lazy"><span class="sh-card-name">${esc(n(p.name))}</span><span class="sh-card-price">${p.variants.length > 1 ? fill(esc(T.from), { p: price }) : price}</span></a>`;
    }).join('');
    return `<section class="sh-cat"><h2>${esc(n(c.name))}</h2><div class="sh-grid">${list}</div></section>`;
  }).join('\n');
  page('index.html', T.shop_title, T.shop_desc, `
<div class="wrap"><div class="sh-head"><h1>${esc(T.shop_title)}</h1><p>${esc(T.shop_lead)}</p></div>
${cards}</div>`);

  page('cart.html', `${T.cart_title} — ${T.shop_title}`, T.shop_desc, `
<div class="wrap sh-narrow"><h1>${esc(T.cart_title)}</h1><div id="cart" aria-live="polite"><p>${esc(T.loading)}</p></div></div>`);

  const field = (k, attrs) => `<label>${esc(T['l_' + k])}<input name="${k}" ${attrs}></label>`;
  page('checkout.html', `${T.checkout_title} — ${T.shop_title}`, T.checkout_desc, `
<div class="wrap sh-narrow"><h1>${esc(T.checkout_title)}</h1>
<form id="checkout" class="sh-form" novalidate>
  ${field('name', 'autocomplete="name" required maxlength="80"')}
  ${field('phone', 'type="tel" inputmode="numeric" autocomplete="tel-national" required maxlength="10"')}
  ${field('email', 'type="email" autocomplete="email" required maxlength="120"')}
  ${field('address1', 'autocomplete="address-line1" required maxlength="120"')}
  ${field('address2', 'autocomplete="address-line2" maxlength="120"')}
  <div class="sh-row">${field('city', 'autocomplete="address-level2" required maxlength="60"')}
  ${field('pincode', 'inputmode="numeric" autocomplete="postal-code" required maxlength="6"')}</div>
  <label>${esc(T.l_state)}<select name="state" required autocomplete="address-level1"><option value="">${esc(T.choose_state)}</option></select></label>
  <div id="summary" class="sh-summary" aria-live="polite"></div>
  <p class="sh-err" id="err" role="alert"></p>
  <button class="btn sh-pay" type="submit">${esc(T.continue_pay)}</button>
  <p class="sh-note">${esc(T.privacy_note)}</p>
</form></div>`);

  page('pay.html', `${T.pay_title} — ${T.shop_title}`, T.pay_title, `
<div class="wrap sh-narrow"><h1>${esc(T.pay_title)}</h1>
<div class="sh-mockpay"><p><b>${esc(T.pay_note_b)}</b> ${esc(T.pay_note)}</p>
<p id="pay-amount" class="sh-total"></p>
<button class="btn sh-pay" id="pay-ok" type="button">${esc(T.pay_ok)}</button>
<button class="btn plain" id="pay-fail" type="button">${esc(T.pay_fail)}</button>
<p class="sh-err" id="err" role="alert"></p></div></div>`);

  page('order.html', `${T.order_title} — ${T.shop_title}`, T.order_title, `
<div class="wrap sh-narrow" id="order" aria-live="polite"><p>${esc(T.loading)}</p></div>`);

  if (L === 'en') page('admin.html', 'Shop admin — Peppynose', 'Peppynose shop admin.', `
<div class="wrap" id="admin"><h1>Shop admin</h1>
<form id="login" class="sh-form sh-narrow" hidden><label>Admin password<input name="password" type="password" autocomplete="current-password" required></label><p class="sh-err" id="login-err" role="alert"></p><button class="btn" type="submit">Log in</button></form>
<div id="panel" hidden></div></div>`);

  // "Buy from Peppynose" buttons on the COPY of this language's Shop page only (the live site is not changed).
  const pf = L === 'en' ? join(DIST, 'products.html') : join(DIST, L, 'products.html');
  let prod = readFileSync(pf, 'utf8'), added = 0;
  prod = prod.replace(/(<a class="pn-qr" href="buy\/([a-z0-9-]+)\.html")/g, (m, a, slug) => {
    if (!C.products.some(p => p.slug === slug)) return m;
    added++; return `<a class="btn sh-direct" href="shop/${slug}.html">${esc(T.buy_direct)}</a>` + a;
  });
  prod = prod.replace('</head>', `  <link rel="stylesheet" href="${L === 'en' ? '' : '../'}shop/shop.css">\n</head>`);
  writeFileSync(pf, prod);
  if (added !== C.products.length) throw new Error(`${L}: added ${added} "Buy from Peppynose" buttons, expected ${C.products.length}`);
}

// ---- 2. seed data for the local database ----
const q = s => `'${String(s).replace(/'/g, "''")}'`;
const sql = ['-- generated by scripts/build.mjs from data/catalogue.json (TEST DATA)'];
C.products.forEach((p, i) => {
  sql.push(`INSERT INTO products (slug, category, data, gst_rate, hsn, gst_confirmed, sort) VALUES (${q(p.slug)}, ${q(p.category)}, ${q(JSON.stringify({ name: p.name, desc: p.desc, alt: p.alt, img: p.img, origin: p.origin, manufacturer: p.manufacturer }))}, ${p.gst_rate}, ${q(p.hsn)}, ${p.gst_confirmed ? 1 : 0}, ${i});`);
  p.variants.forEach((v, j) => sql.push(`INSERT INTO variants (sku, product_slug, label, price, stock, mrp, net_qty, weight_g, amazon, flipkart, sort) VALUES (${q(v.sku)}, ${q(p.slug)}, ${q(JSON.stringify(v.label))}, ${v.price}, ${v.stock}, ${v.mrp ?? 'NULL'}, ${q(v.net_qty)}, ${v.weight_g}, ${q(v.amazon || '')}, ${q(v.flipkart || '')}, ${j});`));
});
const settings = {
  shipping_fee: '4900', free_shipping_above: '49900',          // TEST values: ₹49 delivery, free from ₹499 (owner to decide)
  seller_name: 'Peppynose', seller_address: SELLER_ADDRESS, seller_state: 'Tamil Nadu',
  seller_gstin: '33DQIPM3353P1ZD', seller_email: 'care.peppynose@gmail.com', next_order_number: '1001'
};
for (const [k, v] of Object.entries(settings)) sql.push(`INSERT INTO settings (key, value) VALUES (${q(k)}, ${q(v)});`);
writeFileSync(join(DB, 'seed.sql'), sql.join('\n') + '\n');

// ---- 3. local secrets (only for this computer; never committed) ----
const vars = join(HERE, '.dev.vars');
if (!existsSync(vars)) writeFileSync(vars, `PAYMENT_MODE=mock\nADMIN_PASSWORD=${randomBytes(9).toString('base64url')}\nSESSION_SECRET=${randomBytes(32).toString('hex')}\nORDER_SECRET=${randomBytes(32).toString('hex')}\n`);
console.log(`built dist/ (${C.products.length} product pages × ${LANGS.length} languages) and dist-db/seed.sql`);
