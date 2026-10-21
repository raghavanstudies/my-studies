#!/usr/bin/env python3
"""Peppynose V4: apply all changes to a copy of the V3 repo.  Usage: python3 tools/apply_v4.py /path/to/repo
Run from the unzipped peppynose_site_v4_assets folder. Safe to run twice (it checks for its own markers).
In this repo, rebuild with:  python3 -I tools/peppynose/gen_site.py peppynose && python3 -I tools/peppynose/v3/apply_v3.py peppynose
                             && python3 -I tools/peppynose/v4/tools/apply_v4.py peppynose"""
import sys, os, re, json, shutil, glob
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # the unzipped assets folder
sys.path.insert(0, os.path.join(HERE, 'tools'))
from v4_tracker_strings import SIZES, EMOJI, CHECKS, TODO, UI
from v4_privacy import PRIV
REPO = os.path.abspath(sys.argv[1]); LOG = []
def rd(p): return open(p, encoding='utf-8').read()
def wr(p, s): open(p, 'w', encoding='utf-8').write(s)
def cp(src, dst):
    if not os.path.exists(os.path.join(HERE, src)): return     # in this repo the files are already in peppynose/
    os.makedirs(os.path.dirname(os.path.join(REPO, dst)), exist_ok=True); shutil.copyfile(os.path.join(HERE, src), os.path.join(REPO, dst)); LOG.append('copied ' + dst)
L = {'en': 0, 'ta': 1, 'hi': 2}
COOKIE = {'en': 'Cookie settings', 'ta': 'குக்கீ அமைப்புகள்', 'hi': 'कुकी सेटिंग्स'}

# 1) New files
for f in ['analytics-config.js', 'analytics.js', 'chatbot.js', 'motion.js', 'tracker.js',
          'images/loader/bird-mother.webp', 'images/loader/bird-baby.webp', 'images/loader/bird-perch.webp', 'assets/tracker/README.txt']:
    cp(f, f)

# 2) CSS (Changes 1-6) at the very end of styles.css
css = rd(os.path.join(REPO, 'styles.css'))
if 'Peppynose V4 additions' not in css:
    wr(os.path.join(REPO, 'styles.css'), css.rstrip('\n') + '\n\n' + rd(os.path.join(HERE, 'snippets/v4.css'))); LOG.append('styles.css: V4 block appended')

loader = rd(os.path.join(HERE, 'snippets/loader.html')).strip()
OLD_LOADER = re.compile(r'<div id="pn-loader".*?</div>\s*<script>\(function\(\)\{var l=document\.getElementById\(\'pn-loader\'\).*?</script>', re.S)
SCRIPTS = '<script src="/analytics-config.js" defer></script>\n<script src="/analytics.js" defer></script>\n<script src="/chatbot.js" defer></script>\n'
pages = [p for p in glob.glob(REPO + '/**/*.html', recursive=True) if '/.git/' not in p]
for p in sorted(pages):
    rel = os.path.relpath(p, REPO); s = rd(p); o = s
    lang = (re.search(r'<html lang="(\w\w)', s) or [None, 'en'])[1]
    is_buy = '/buy/' in '/' + rel
    if 'analytics.js' not in s:
        add = SCRIPTS + ('' if is_buy else '<script src="/motion.js" defer></script>\n')
        s = s.replace('</body>', add + '</body>', 1)
    if not is_buy and 'pl-art' not in s:                                        # Change 5: new loader
        s, n = OLD_LOADER.subn(loader, s, count=1)
        if not n: print('WARNING: no V3 loader found in', rel)
    if 'data-pn-cookie-settings' not in s:                                      # Change 3: footer link
        if is_buy:
            s = s.replace('</div></footer>', f'<a href="#" data-pn-cookie-settings>{COOKIE[lang]}</a></div></footer>', 1)
        else:
            s = re.sub(r'(<a href="[^"]*privacy\.html">[^<]*</a></li>)', r'\1' + f'<li><a href="#" data-pn-cookie-settings>{COOKIE[lang]}</a></li>', s, count=1)
    if s != o: wr(p, s); LOG.append('patched ' + rel)

# 3) Tracker pages (Change 2)
def tracker(lang):
    p = os.path.join(REPO, ('' if lang == 'en' else lang + '/') + 'pregnancy-tracker.html'); s = rd(p)
    if 'trk-hero' in s: return
    i = L[lang]
    m = re.search(r'<script type="application/json" id="trk-data">(.*?)</script>', s, re.S); D = json.loads(m.group(1)); S = D['s']
    for k, v in UI.items(): S[k] = v[i]
    D['sizes'] = {str(w): v[i] for w, v in SIZES.items()}; D['emoji'] = {str(w): e for w, e in EMOJI.items()}
    D['checks'] = [{'id': c[0], 'a': c[1], 'b': c[2], 't': c[3 + i]} for c in CHECKS]
    D['todo'] = [{'a': t[0], 'b': t[1], 'items': [x[i] for x in t[2]]} for t in TODO]
    D['logo'] = '/images/logo-wordmark.webp'
    tip = re.search(r'<div class="trk-card trk-tip">(.*?)\n</div>\n<p class="disclaimer"', s, re.S).group(1)       # V3 tip heading + nudges, unchanged
    tip = re.sub(r'^<h2>', '<h2 class="trk-tip-h">', tip)
    disc = re.search(r'<p class="disclaimer" role="note">(.*?)</p>', s).group(1)
    acts = re.search(r'<div class="trk-actions">.*?</div>', s, re.S).group(0)
    wa_svg = re.search(r'<svg aria-hidden="true" viewBox="0 0 24 24" width="20".*?</svg>', acts, re.S).group(0)
    week = re.search(r'<div class="trk-card" aria-live="polite">\n(.*?)\n</div>\n<div class="trk-card trk-tip">', s, re.S).group(1)
    week = week.replace('<div class="trk-week"><span class="big" id="r-week"></span><span class="tri" id="r-tri"></span></div>', '<div class="trk-week"><span class="tri" id="r-tri"></span></div>')
    week = week.replace('<span id="r-left"></span>', '<span></span>')
    new = f'''<div id="trk-result" hidden>
<div class="trk-card trk-hero" aria-live="polite">
<div class="trk-hero-img"><img id="r-img" alt="" width="800" height="800" decoding="async" hidden><div class="trk-ph" id="r-ph" aria-hidden="true"><span id="r-ph-n"></span></div></div>
<div class="trk-hero-txt"><span class="big" id="r-week"></span><p class="trk-size" id="r-size"></p><p class="trk-left" id="r-left"></p>
<button class="btn card" type="button" id="r-card">{wa_svg}<span>{S['v4_card_btn']}</span></button><p class="trk-msg" id="r-card-msg" role="status">{S['v4_card_private']}</p></div>
<p class="trk-credit" id="r-credit" hidden></p>
</div>
<div class="trk-tabs" role="tablist" aria-label="{S['v4_tabs_label']}"><button type="button" role="tab" id="t-week" aria-controls="p-week" aria-selected="true">{S['v4_tab_week']}</button><button type="button" role="tab" id="t-checks" aria-controls="p-checks" aria-selected="false" tabindex="-1">{S['v4_tab_checks']}</button><button type="button" role="tab" id="t-todo" aria-controls="p-todo" aria-selected="false" tabindex="-1">{S['v4_tab_todo']}</button></div>
<div class="trk-card trk-panel trk-tip" id="p-week" role="tabpanel" aria-labelledby="t-week">
{week}
{tip}
</div>
<div class="trk-card trk-panel" id="p-checks" role="tabpanel" aria-labelledby="t-checks" hidden><h2>{S['v4_checks_h']}</h2><p class="trk-sub" style="margin:0 0 10px">{S['v4_checks_intro']}</p><ul class="trk-checks" id="r-checks"></ul></div>
<div class="trk-card trk-panel" id="p-todo" role="tabpanel" aria-labelledby="t-todo" hidden><h2 id="r-todo-h"></h2><ul class="trk-todo" id="r-todo"></ul><p class="trk-note">{S['v4_todo_saved']}</p></div>
<p class="disclaimer trk-d2" role="note">{disc}</p>
{acts}
</div>'''
    a = s.index('<div id="trk-result" hidden>'); b = s.index('<p class="privacy">')
    s = s[:a] + new + '\n' + s[b:]
    s = s.replace('<section class="trk">', '<section class="trk" data-clarity-mask="True">', 1)   # Clarity never sees the dates
    s = re.sub(r'(<script type="application/json" id="trk-data">).*?(</script>)', lambda mm: mm.group(1) + json.dumps(D, ensure_ascii=False) + mm.group(2), s, count=1, flags=re.S)
    wr(p, s); LOG.append('tracker page rebuilt: ' + os.path.relpath(p, REPO))
for lg in L: tracker(lg)

# 4) Privacy pages (Change 3)
for lg in L:
    p = os.path.join(REPO, ('' if lg == 'en' else lg + '/') + 'privacy.html'); s = rd(p)
    if 'pn-priv-analytics' in s: continue
    P = PRIV[lg]
    s = re.sub(r'(<div class="page-head">\s*<div class="wrap"><span class="eyebrow">[^<]*</span><h1>[^<]*</h1><p>)[^<]*(</p>)', lambda mm: mm.group(1) + P['updated'] + mm.group(2), s, count=1)
    s = re.sub(r'(<h2>[^<]*</h2>\s*)<p>[^<]*</p>', lambda mm: mm.group(1) + '<p>' + P['summary'] + '</p>', s, count=1)
    # new sections go right before the "Buying on Amazon.in and Flipkart" heading (2nd-last policy block)
    k = s.index('<h2>Amazon.in') if lg != 'en' else s.index('<h2>Buying on Amazon.in')
    s = s[:k] + P['sections'] + '\n' + s[k:]
    wr(p, s); LOG.append('privacy updated: ' + os.path.relpath(p, REPO))
print('\n'.join(LOG)); print(len(LOG), 'changes')
