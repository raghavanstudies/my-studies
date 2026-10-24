#!/usr/bin/env python3
"""Peppynose pregnancy tracker as an app-style dashboard (EN / TA / HI). Safe to run twice (checks for 'dash-tiles').
After the date: a week ring + baby picture, a big "Add today's weight" button and 6 tiles. A tile opens its details
(My weight, This week, Checkups, To-do) as a full-screen panel with a Back button. Logic: peppynose/dash.js.
Rebuild chain: gen_site.py -> v3/apply_v3.py -> v4/tools/apply_v4.py -> weight/apply_weight.py
               -> dashboard/apply_dashboard.py -> cachebust.py   (all with: python3 -I <script> peppynose)
Tamil and Hindi text: FOR BOSS REVIEW."""
import sys, os, re, json
REPO = os.path.abspath(sys.argv[1]); LOG = []
L = {'en': 0, 'ta': 1, 'hi': 2}
def rd(p): return open(p, encoding='utf-8').read()
def wr(p, s): open(p, 'w', encoding='utf-8').write(s)

T = {  # key: (en, ta, hi)
 'd_weight': ('My weight', 'என் எடை', 'मेरा वज़न'),
 'd_size': ('Baby size', 'குழந்தையின் அளவு', 'बच्चे का आकार'),
 'd_check': ('Next checkup', 'அடுத்த பரிசோதனை', 'अगला चेकअप'),
 'd_todo': ('To-do', 'செய்ய வேண்டியவை', 'करने के काम'),
 'd_due': ('Due date', 'பிரசவ தேதி', 'ड्यू डेट'),
 'd_tip': ('Tip of the week', 'இந்த வாரக் குறிப்பு', 'इस हफ़्ते की सलाह'),
 'd_add_weight': ("Add today's weight", 'இன்றைய எடையைச் சேர்', 'आज का वज़न डालें'),
 'd_weight_empty': ('Tap to start', 'தொடங்க தட்டவும்', 'शुरू करने के लिए टैप करें'),
 'd_todo_n': ('{d} of {n} done', '{n}-இல் {d} முடிந்தது', '{n} में से {d} पूरे'),
 'd_weeks': ('weeks {a}–{b}', 'வாரங்கள் {a}–{b}', 'हफ़्ते {a}–{b}'),
 'd_all_done': ('All checkups done', 'அனைத்து பரிசோதனைகளும் முடிந்தன', 'सभी चेकअप हो गए'),
 'd_back': ('Back', 'பின்செல்', 'वापस'),
 'd_week_lbl': ('week', 'வாரம்', 'हफ़्ता'),
 'd_pct': ('{p}% of the way', '{p}% பயணம் முடிந்தது', '{p}% सफ़र पूरा'),
 'd_tiles': ('Your pregnancy at a glance', 'உங்கள் கர்ப்பம் ஒரே பார்வையில்', 'आपकी प्रेग्नेंसी एक नज़र में'),
}

for lang, i in L.items():
    p = os.path.join(REPO, ('' if lang == 'en' else lang + '/') + 'pregnancy-tracker.html'); s = o = rd(p)
    m = re.search(r'<script type="application/json" id="trk-data">(.*?)</script>', s, re.S); D = json.loads(m.group(1)); S = D['s']
    for k in [k for k in S if k.startswith('d_')]: del S[k]
    for k, v in T.items(): S[k] = v[i]
    s = re.sub(r'(<script type="application/json" id="trk-data">).*?(</script>)', lambda mm: mm.group(1) + json.dumps(D, ensure_ascii=False) + mm.group(2), s, count=1, flags=re.S)
    if 'dash-tiles' not in s:
        # 1) Hero: week ring beside the picture; the "Week 22" text stays for screen readers
        ring = ('<div class="dash-top"><div class="dash-ring" aria-hidden="true"><svg viewBox="0 0 120 120"><circle class="dr-bg" cx="60" cy="60" r="52"/>'
                f'<circle class="dr-fg" id="r-ring" cx="60" cy="60" r="52"/></svg><div class="dr-txt"><b id="r-ring-n"></b><small>{S["d_week_lbl"]}</small></div></div>')
        a = '<div class="trk-card trk-hero" aria-live="polite">\n<div class="trk-hero-img">'
        assert a in s; s = s.replace(a, '<div class="trk-card trk-hero dash-hero" aria-live="polite">\n' + ring + '<div class="trk-hero-img">', 1)
        a = '</div>\n<div class="trk-hero-txt"><span class="big" id="r-week"></span>'
        assert a in s; s = s.replace(a, '</div></div>\n<div class="trk-hero-txt"><span class="sr-only" id="r-week"></span><p class="dash-pct" id="r-pct"></p>', 1)
        # 2) Big button + tiles right after the hero
        tile = lambda key, panel, ico: (f'<button type="button" class="dash-tile" data-open="{panel}"><span class="dt-ico" aria-hidden="true">{ico}</span>'
                                       f'<span class="dt-h">{S[key]}</span><b class="dt-v" id="dt-{key[2:]}"></b><span class="dt-s" id="dt-{key[2:]}-s"></span></button>')
        tiles = (f'\n<button type="button" class="btn dash-add" data-open="p-weight"><span aria-hidden="true">＋</span> {S["d_add_weight"]}</button>'
                 f'\n<h2 class="sr-only">{S["d_tiles"]}</h2><div class="dash-tiles">'
                 + tile('d_weight', 'p-weight', '⚖️') + tile('d_size', 'p-week', '🍼') + tile('d_check', 'p-checks', '🩺')
                 + tile('d_todo', 'p-todo', '✅') + tile('d_due', 'p-week', '📅') + tile('d_tip', 'p-week', '💡') + '</div>')
        s = s.replace('<!--wt-->', tiles.lstrip('\n') + '\n<!--wt-->', 1)
        if 'dash.js' not in s:
            s = re.sub(r'(<script src="(?:\.\./)?weight\.js(?:\?v=[0-9a-f]+)?" defer></script>)', lambda mm: mm.group(1) + re.sub(r'weight\.js(\?v=[0-9a-f]+)?', 'dash.js', mm.group(1)), s, count=1)
        s = s.replace('<section class="trk" data-clarity-mask="True">', '<section class="trk dash" data-clarity-mask="True">', 1)
    # 3) The four detail cards become full-screen panels with a Back button (also after weight/apply_weight.py re-made the weight card)
    back = f'<div class="dash-bar"><button type="button" class="dash-back" data-close><span aria-hidden="true">←</span> {S["d_back"]}</button></div>'
    s = s.replace('<section class="trk-card wt-card" id="p-weight" aria-labelledby="wt-title">',
                  f'<section class="trk-card wt-card dash-panel" id="p-weight" role="dialog" aria-modal="true" aria-labelledby="wt-title" hidden>{back}', 1)
    for pid in ('p-week', 'p-checks', 'p-todo'):
        s = re.sub(r'<div class="trk-card trk-sec((?:(?! dash-panel)[^"])*)" id="%s">\n?' % pid,
                   lambda mm: f'<div class="trk-card trk-sec{mm.group(1)} dash-panel" id="{pid}" role="dialog" aria-modal="true" hidden>{back}', s, count=1)
    assert 'dash.js' in s and s.count('dash-panel') == 4 and s.count('class="dash-tile"') == 6
    if s != o: wr(p, s); LOG.append('dashboard: ' + os.path.relpath(p, REPO))
print('\n'.join(LOG)); print(len(LOG), 'changes')
