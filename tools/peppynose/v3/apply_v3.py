#!/usr/bin/env python3
"""Peppynose V3: apply all V3 changes to the peppynose.com repo in one go.

Usage (from the unzipped peppynose_site_v3_assets folder):
    python3 tools/apply_v3.py /path/to/repo
In this repo, run it after gen_site.py (which rebuilds the English pages without the V3 parts):
    python3 -I tools/peppynose/gen_site.py peppynose && python3 -I tools/peppynose/v3/apply_v3.py peppynose
It (1) copies new images/snippets, (2) patches the 30 existing pages (header logo, loader, tracker link in nav + footer,
home store line + tracker teaser, "Scan to buy" QR codes), (3) appends snippets/v3.css to styles.css, (4) generates
/buy/*.html, /ta/buy/*.html, /hi/buy/*.html and the 3 pregnancy-tracker pages, (5) adds the new URLs to sitemap.xml.
Safe to run twice (every step checks for its marker first). Python 3.8+, standard library only.
"""
import html, json, os, re, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
# in the repo the snippets sit next to this script; the images, QR codes and tracker.js are already in peppynose/
ASSETS = HERE if os.path.isdir(os.path.join(HERE, 'snippets')) else os.path.dirname(HERE)
REPO = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '.')
V = json.load(open(os.path.join(HERE, 'v3_strings.json'), encoding='utf-8'))
S, TIPS = V['strings'], V['tips']
PRODUCTS = json.load(open(os.path.join(HERE, 'products_v3.json'), encoding='utf-8'))
QRP = [p for p in PRODUCTS if p['qr']]
LANGS = ['en', 'ta', 'hi']; SITE = 'https://www.peppynose.com/'
PAGES = ['index', 'products', 'about', 'faq', 'contact', 'privacy', 'terms', 'returns', 'shipping', '404']
E = lambda s: html.escape(s, quote=True)
t = lambda key, lang, **kw: S[key][lang].format(**kw)
LOG = []

def rd(p): return open(p, encoding='utf-8').read()
def wr(p, s):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8', newline='\n') as f: f.write(s)
def page_path(lang, name): return os.path.join(REPO, name + '.html') if lang == 'en' else os.path.join(REPO, lang, name + '.html')
def sub1(pat, rep, s, what, flags=re.S):
    n = len(re.findall(pat, s, flags))
    if n != 1: raise SystemExit(f'ERROR: expected 1 match for {what}, found {n}')
    return re.sub(pat, rep, s, count=1, flags=flags)

# ---------- 1. copy assets ----------
def copy_assets():
    for rel in ['images/logo-wordmark.webp', 'images/logo-wordmark.png', 'tracker.js']:
        src = os.path.join(ASSETS, rel)
        if os.path.exists(src): os.makedirs(os.path.dirname(os.path.join(REPO, rel)) or REPO, exist_ok=True); shutil.copy2(src, os.path.join(REPO, rel))
    q = os.path.join(ASSETS, 'images', 'qr')
    if os.path.isdir(q): shutil.copytree(q, os.path.join(REPO, 'images', 'qr'), dirs_exist_ok=True)
    LOG.append('assets copied')

# ---------- 2. patch existing pages ----------
LOADER = rd(os.path.join(ASSETS, 'snippets', 'loader.html')).strip()

def brand_html(asset, home_href):
    return (f'<a class="brand" href="{home_href}"><img class="brand-mark" src="{asset}logo-mark.png" alt="" width="42" height="42">'
            f'<img class="brand-word" src="{asset}images/logo-wordmark.webp" alt="Peppynose" width="640" height="131"></a>')

def qr_html(lang, slug, name, asset):
    return (f'<a class="pn-qr" href="buy/{slug}.html"><img src="{asset}images/qr/{lang}/{slug}.svg" alt="{E(t("qr_alt", lang, name=name))}" '
            f'width="106" height="106" loading="lazy"><span>{E(S["qr_caption"][lang])}</span></a>')

def teaser_html(lang):
    return ('<section class="tracker-teaser"><div class="wrap"><div class="tt"><span class="tt-ic" aria-hidden="true">🤰</span><div>'
            f'<span class="eyebrow">{E(S["teaser_eyebrow"][lang])}</span><h2>{S["teaser_h2"][lang]}</h2><p>{E(S["teaser_p"][lang])}</p></div>'
            f'<a class="btn ghost" href="pregnancy-tracker.html">{E(S["teaser_btn"][lang])}</a></div></div></section>')

def patch_page(lang, name):
    p = page_path(lang, name); s = rd(p)
    if 'class="brand-word"' in s: return 'already'
    m = re.search(r'<a class="brand" href="([^"]*)"><img (?:src="([^"]*)logo-mark\.png" alt=""|alt="" src="([^"]*)logo-mark\.png")/?>Peppynose<sup>™</sup></a>', s)
    if not m: raise SystemExit(f'ERROR: header brand not found in {p}')
    asset = m.group(2) if m.group(2) is not None else m.group(3)
    s = s.replace(m.group(0), brand_html(asset, m.group(1)), 1)
    # loader: first thing inside <body>
    s = sub1(r'<body>', '<body>\n' + LOADER, s, f'<body> in {p}')
    # nav: tracker link before Contact
    nav = re.search(r'(<nav[^>]*id="nav"[^>]*>)(.*?)(</nav>)', s, re.S)
    cm = re.search(r'<a (?:aria-current="page" )?href="([^"]*)contact\.html"', nav.group(2))
    lp = cm.group(1)                                         # '' for normal pages, '/', '/ta/', '/hi/' on 404 pages
    link = f'<a href="{lp}pregnancy-tracker.html">{E(S["nav_tracker"][lang])}</a>'
    newnav = nav.group(2).replace(cm.group(0), link + '\n' + cm.group(0), 1)
    s = s[:nav.start(2)] + newnav + s[nav.end(2):]
    # footer: add to the "Explore" list after Contact
    f0 = s.index('<footer')
    fm = re.search(r'(<li><a href="' + re.escape(lp) + r'contact\.html">[^<]*</a></li>)(</ul>)', s[f0:])
    if not fm: raise SystemExit(f'ERROR: footer Explore list not found in {p}')
    s = s[:f0 + fm.end(1)] + f'<li><a href="{lp}pregnancy-tracker.html">{E(S["nav_tracker"][lang])}</a></li>' + s[f0 + fm.end(1):]
    if name == 'index':
        s = sub1(r'(<div class="band2-txt">\s*<h2>.*?</h2>\s*<p>.*?</p>)', lambda mm: mm.group(1) + f'\n<p class="store-line">{E(S["store_line"][lang])}</p>', s, 'band2 paragraph')
        s = sub1(r'(<section class="ages-p">.*?</section>)', lambda mm: mm.group(1) + '\n' + teaser_html(lang), s, 'ages-p section')
    if name in ('index', 'products'):
        n = 0
        def add_qr(mm):
            nonlocal n
            block = mm.group(0)
            h3 = re.search(r'<h3>(.*?)</h3>', block, re.S)
            title = html.unescape(re.sub(r'<[^>]+>', '', h3.group(1))).strip() if h3 else ''
            prod = next((q for q in QRP if q['name'][lang] == title), None)
            if not prod or 'unavailable' in block.split('>', 1)[0]: return block
            n += 1
            return re.sub(r'(</div>\s*</article>)$', qr_html(lang, prod['slug'], prod['name'][lang], asset) + r'\1', block)
        s = re.sub(r'<article class="card[^"]*"[^>]*>.*?</article>', add_qr, s, flags=re.S)
        want = 4 if name == 'index' else len(QRP)
        if n != want: raise SystemExit(f'ERROR: {p}: added {n} QR codes, expected {want}')
    wr(p, s); return 'patched'

# ---------- 3. CSS ----------
def patch_css():
    p = os.path.join(REPO, 'styles.css'); s = rd(p)
    if 'Peppynose V3 additions' in s: return
    wr(p, s.rstrip('\n') + '\n\n' + rd(os.path.join(ASSETS, 'snippets', 'v3.css')))
    LOG.append('styles.css: v3.css appended')

# ---------- helpers for new pages ----------
def set_meta(s, key, val):
    def rep(m):
        tag = m.group(0)
        if re.search(r'(?:name|property)="' + re.escape(key) + '"', tag):
            return re.sub(r'content="[^"]*"', 'content="' + E(val) + '"', tag)
        return tag
    return re.sub(r'<meta\b[^>]*>', rep, s)

def url(lang, path): return SITE + ('' if lang == 'en' else lang + '/') + path
def alternates(path):
    return '\n'.join([f'  <link rel="alternate" hreflang="{l}" href="{url(l, path)}">' for l in LANGS] + [f'  <link rel="alternate" hreflang="x-default" href="{url("en", path)}">'])

# ---------- 4a. pregnancy tracker pages (built from the patched about.html of each language) ----------
WA_SVG = '<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 11.6a8.4 8.4 0 0 1-12.3 7.5L3.5 20.5l1.4-4.6a8.4 8.4 0 1 1 15.6-4.3z"/><path d="M9 8.6c0 3.4 3 6.4 6.4 6.4l1.2-1.6-2-1-1 .8a5 5 0 0 1-2.8-2.8l.8-1-1-2z" fill="currentColor" stroke="none"/></svg>'

def tracker_main(lang):
    g = lambda k: E(S[k][lang])
    keys = [k for k in S if k.startswith('tr_')]
    data = {'url': url(lang, 'pregnancy-tracker.html'), 's': {k: S[k][lang] for k in keys}, 'tips': {w: TIPS[w][lang] for w in TIPS}}
    js = json.dumps(data, ensure_ascii=False).replace('</', '<\\/')
    return f'''<main>
<div class="page-head"><div class="wrap"><span class="eyebrow">{g("teaser_eyebrow")}</span><h1>{g("tr_h1")}</h1><p>{g("tr_intro")}</p></div></div>
<section class="trk"><div class="wrap">
<p class="disclaimer" role="note">{g("tr_disclaimer")}</p>
<form class="trk-card" id="trk-form" novalidate>
<fieldset><legend>{g("tr_legend")}</legend><div class="opt-row">
<label><input type="radio" name="mode" value="due" checked> {g("tr_opt_due")}</label>
<label><input type="radio" name="mode" value="lmp"> {g("tr_opt_lmp")}</label>
</div></fieldset>
<div class="date-row"><label for="trk-date">{g("tr_date")}<input type="date" id="trk-date" name="date" required></label><button class="btn go" type="submit">{g("tr_go")}</button></div>
<p class="err" id="trk-err" role="alert"></p>
</form>
<div id="trk-result" hidden>
<div class="trk-card" aria-live="polite">
<div class="trk-week"><span class="big" id="r-week"></span><span class="tri" id="r-tri"></span></div>
<p class="trk-sub" id="r-age"></p>
<div class="trk-bar" id="r-barwrap" role="progressbar" aria-valuemin="0" aria-valuemax="40"><span id="r-bar"></span></div>
<div class="trk-bar-l"><span id="r-prog"></span><span id="r-left"></span></div>
<p class="trk-sub" id="r-due"></p>
</div>
<div class="trk-card trk-tip"><h2>{g("tr_tip_h")}</h2><p id="r-tip"></p>
<div class="trk-nudge" id="n-mob" hidden><p>{g("tr_nudge_mob")}</p><a class="btn small ghost" href="buy/mom-on-board-sign.html">{g("tr_see_sign")}</a></div>
<div class="trk-nudge" id="n-bob" hidden><p>{g("tr_nudge_bob")}</p><a class="btn small ghost" href="buy/baby-on-board-sign.html">{g("tr_see_sign")}</a></div>
<div class="trk-nudge" id="n-teeth" hidden><p>{g("tr_nudge_teeth")}</p><a class="btn small ghost" href="products.html#teethers">{g("tr_see_teethers")}</a></div>
</div>
<p class="disclaimer" role="note">{g("tr_disclaimer")}</p>
<div class="trk-actions"><a class="btn wa" id="r-share" href="https://wa.me/" target="_blank" rel="noopener" aria-label="{g("tr_share_aria")}">{WA_SVG}<span>{g("tr_share")}</span></a><button class="btn plain" type="button" id="r-change">{g("tr_change")}</button><button class="btn plain" type="button" id="r-clear">{g("tr_clear")}</button></div>
</div>
<p class="privacy">{g("tr_privacy")}</p>
</div></section>
<script type="application/json" id="trk-data">{js}</script>
</main>'''

def make_tracker(lang):
    s = rd(page_path(lang, 'about'))
    asset = '' if lang == 'en' else '../'
    for l in LANGS: s = s.replace(url(l, 'about.html'), url(l, 'pregnancy-tracker.html'))
    s = sub1(r'<title>.*?</title>', '<title>' + E(S['tr_title'][lang]) + '</title>', s, 'title')
    for k in ['description', 'og:description', 'twitter:description']: s = set_meta(s, k, S['tr_desc'][lang])
    for k in ['og:title', 'twitter:title']: s = set_meta(s, k, S['tr_title'][lang])
    s = re.sub(r'(<a) aria-current="page" (href="about\.html">)', r'\1 \2', s)
    s = re.sub(r'(<a href="about\.html") aria-current="page"', r'\1', s)
    s = s.replace(f'<a href="pregnancy-tracker.html">{E(S["nav_tracker"][lang])}</a>\n<a href="', f'<a href="pregnancy-tracker.html" aria-current="page">{E(S["nav_tracker"][lang])}</a>\n<a href="', 1)
    s = sub1(r'<main>.*</main>', lambda m: tracker_main(lang), s, 'main')
    s = s.replace('</body>', f'<script src="{asset}tracker.js" defer></script>\n</body>', 1)
    wr(page_path(lang, 'pregnancy-tracker'), s)

# ---------- 4b. buy chooser pages ----------
def head_bits(lang):
    s = rd(page_path(lang, 'about'))
    fonts = re.findall(r'<link[^>]*fonts\.googleapis\.com/css2[^>]*>', s)
    wa = re.search(r'<a [^>]*class="wa-float".*?</a>', s, re.S).group(0)
    return fonts, wa

def make_buy(lang, p):
    fonts, wa = head_bits(lang)
    up = '../' if lang == 'en' else '../../'           # from /buy/ or /ta/buy/ to the repo root
    home = '../index.html'                              # same-language home (/buy/ -> /, /ta/buy/ -> /ta/)
    name = p['name'][lang]; path = f"buy/{p['slug']}.html"
    nt = S['new_tab'][lang]
    packs = []
    for pk in p['packs']:
        btns = []
        if pk['amazon']:
            btns.append(f'<a class="btn amazon" href="{E(pk["amazon"])}" target="_blank" rel="noopener" aria-label="{E(S["buy_amazon"][lang] + " · " + pk["label"][lang] + " " + nt)}"><span>{E(S["buy_amazon"][lang])}</span><small>{E(S["check_price"][lang])}</small></a>')
        if pk['flipkart']:
            btns.append(f'<a class="btn flipkart" href="{E(pk["flipkart"])}" target="_blank" rel="noopener" aria-label="{E(S["buy_flipkart"][lang] + " · " + pk["label"][lang] + " " + nt)}"><span>{E(S["buy_flipkart"][lang])}</span><small>{E(S["check_price"][lang])}</small></a>')
        packs.append(f'<div class="buy-pack"><h2>{E(pk["label"][lang])}</h2><div class="buy-big">' + ''.join(btns) + '</div></div>')
    title = t('buy_title', lang, name=name); desc = t('buy_desc', lang, name=name)
    og_locale = {'en': '', 'ta': '\n  <meta property="og:locale" content="ta_IN">', 'hi': '\n  <meta property="og:locale" content="hi_IN">'}[lang]
    doc = f'''<!doctype html>
<html lang="{lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{E(title)}</title>
  <meta name="description" content="{E(desc)}">
  <link rel="canonical" href="{url(lang, path)}">
{alternates(path)}
  <meta property="og:url" content="{url(lang, path)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Peppynose">{og_locale}
  <meta property="og:title" content="{E(title)}">
  <meta property="og:description" content="{E(desc)}">
  <meta property="og:image" content="{SITE}{p['img']}">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="{up}favicon.png" type="image/png">
  <link rel="apple-touch-icon" href="{up}apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  {chr(10).join("  " + f if i else f for i, f in enumerate(fonts))}
  <link rel="stylesheet" href="{up}styles.css">
  <script src="{up}lang.js"></script>
</head>
<body>
  <header class="buy-head"><div class="wrap bar">{brand_html(up, home)}</div></header>
  <main class="buy-page"><div class="wrap buy-wrap">
    <figure class="buy-ph"><img src="{up}{p['img']}" alt="{E(p['alt'][lang])}" width="{p['img_w']}" height="{p['img_h']}" fetchpriority="high"></figure>
    <div class="buy-box">
      <span class="eyebrow">{E(S["buy_eyebrow"][lang])}</span>
      <h1>{E(name)}</h1>
      <p class="buy-desc">{E(p['desc'][lang])}</p>
      {''.join(packs)}
      <p class="buy-note">{E(S["buy_note"][lang])}</p>
      <a class="link-arrow" href="../products.html">{E(S["buy_all"][lang])} →</a>
    </div>
  </div></main>
  <footer class="buy-foot"><div class="wrap"><span>© 2026 Peppynose™</span><a href="mailto:care.peppynose@gmail.com">care.peppynose@gmail.com</a><a href="{home}">{E(S["buy_home"][lang])}</a></div></footer>
  {wa.replace('src="../', 'src="' + up)}
  <script src="{up}wa.js" defer></script>
</body>
</html>
'''
    wr(os.path.join(REPO, path) if lang == 'en' else os.path.join(REPO, lang, path), doc)

# ---------- 5. sitemap ----------
def patch_sitemap():
    p = os.path.join(REPO, 'sitemap.xml'); s = rd(p)
    if 'pregnancy-tracker.html' in s: return
    paths = ['pregnancy-tracker.html'] + [f"buy/{q['slug']}.html" for q in QRP]
    rows = []
    for path in paths:
        alts = ''.join(f'<xhtml:link rel="alternate" hreflang="{l}" href="{url(l, path)}"/>' for l in LANGS) + f'<xhtml:link rel="alternate" hreflang="x-default" href="{url("en", path)}"/>'
        for l in LANGS: rows.append(f'  <url><loc>{url(l, path)}</loc>{alts}</url>')
    wr(p, s.replace('</urlset>', '\n'.join(rows) + '\n</urlset>'))
    LOG.append(f'sitemap.xml: +{len(rows)} URLs')

if __name__ == '__main__':
    if not os.path.exists(os.path.join(REPO, 'styles.css')): raise SystemExit('Give the repo root (the folder with styles.css) as the first argument.')
    copy_assets()
    for lang in LANGS:
        for name in PAGES: LOG.append(f'{lang}/{name}.html: {patch_page(lang, name)}')
    patch_css()
    for lang in LANGS:
        make_tracker(lang)
        for q in QRP: make_buy(lang, q)
    LOG.append(f'generated 3 tracker pages and {3 * len(QRP)} buy pages')
    patch_sitemap()
    print('\n'.join(LOG))
