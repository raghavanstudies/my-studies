#!/usr/bin/env python3
"""Peppynose pregnancy tracker: "My weight" card and the no-tabs layout (EN / TA / HI). Safe to run twice.
After this script the result shows, one below the other: week + picture, My weight, This week, Checkups, To-do.
The logic is in peppynose/weight.js; weights are kept ONLY in the browser (localStorage "pn_weight").
Rebuild chain:  python3 -I tools/peppynose/gen_site.py peppynose && python3 -I tools/peppynose/v3/apply_v3.py peppynose
                && python3 -I tools/peppynose/v4/tools/apply_v4.py peppynose && python3 -I tools/peppynose/weight/apply_weight.py peppynose
                && python3 -I tools/peppynose/cachebust.py peppynose
Tamil and Hindi text: FOR BOSS REVIEW."""
import sys, os, re, json
REPO = os.path.abspath(sys.argv[1]); LOG = []
L = {'en': 0, 'ta': 1, 'hi': 2}
def rd(p): return open(p, encoding='utf-8').read()
def wr(p, s): open(p, 'w', encoding='utf-8').write(s)

W = {  # key: (en, ta, hi)
 'w_tab': ('My weight', 'என் எடை', 'मेरा वज़न'),
 'w_h': ('Your weight during pregnancy', 'கர்ப்ப காலத்தில் உங்கள் எடை', 'प्रेग्नेंसी में आपका वज़न'),
 'w_intro': ('Add your weight each week. See it week by week or month by month, next to the usual healthy range.',
             'ஒவ்வொரு வாரமும் உங்கள் எடையைச் சேர்க்கவும். வாரவாரியாகவோ மாதவாரியாகவோ, வழக்கமான ஆரோக்கிய வரம்புடன் ஒப்பிட்டுப் பாருங்கள்.',
             'हर हफ़्ते अपना वज़न डालें। इसे हफ़्ते या महीने के हिसाब से, सामान्य स्वस्थ सीमा के साथ देखें।'),
 'w_setup_h': ('First, two details (only once)', 'முதலில், இரண்டு விவரங்கள் (ஒருமுறை மட்டும்)', 'पहले, दो जानकारी (सिर्फ़ एक बार)'),
 'w_height': ('Your height (cm)', 'உங்கள் உயரம் (செ.மீ.)', 'आपकी लंबाई (सेमी)'),
 'w_pre': ('Your weight before pregnancy (kg)', 'கர்ப்பத்திற்கு முன் உங்கள் எடை (கி.கி.)', 'प्रेग्नेंसी से पहले आपका वज़न (किलो)'),
 'w_setup_btn': ('Save', 'சேமி', 'सेव करें'),
 'w_bmi': ('Your BMI before pregnancy: {b} ({c}). Usual healthy gain for the whole pregnancy: {lo}–{hi} kg.',
           'கர்ப்பத்திற்கு முந்தைய உங்கள் BMI: {b} ({c}). முழு கர்ப்ப காலத்திற்கான வழக்கமான ஆரோக்கிய எடை அதிகரிப்பு: {lo}–{hi} கி.கி.',
           'प्रेग्नेंसी से पहले आपका BMI: {b} ({c})। पूरी प्रेग्नेंसी में वज़न का सामान्य स्वस्थ बढ़ना: {lo}–{hi} किलो।'),
 'w_cat_under': ('underweight', 'குறைந்த எடை', 'कम वज़न'),
 'w_cat_normal': ('normal weight', 'சரியான எடை', 'सामान्य वज़न'),
 'w_cat_over': ('overweight', 'அதிக எடை', 'ज़्यादा वज़न'),
 'w_cat_obese': ('obese', 'மிக அதிக எடை', 'मोटापा'),
 'w_add_h': ('Add your weight', 'எடையைச் சேர்க்கவும்', 'वज़न डालें'),
 'w_week': ('Week', 'வாரம்', 'हफ़्ता'),
 'w_kg': ('Weight (kg)', 'எடை (கி.கி.)', 'वज़न (किलो)'),
 'w_add_btn': ('Add', 'சேர்', 'जोड़ें'),
 'w_edit_setup': ('Change height or starting weight', 'உயரம் அல்லது தொடக்க எடையை மாற்ற', 'लंबाई या शुरुआती वज़न बदलें'),
 'w_view_week': ('Week-wise', 'வாரவாரியாக', 'हफ़्ते के हिसाब से'),
 'w_view_month': ('Month-wise', 'மாதவாரியாக', 'महीने के हिसाब से'),
 'w_col_week': ('Week', 'வாரம்', 'हफ़्ता'),
 'w_col_month': ('Month', 'மாதம்', 'महीना'),
 'w_col_weight': ('Weight', 'எடை', 'वज़न'),
 'w_col_gain': ('Gained', 'அதிகரிப்பு', 'बढ़ा'),
 'w_col_range': ('Healthy gain', 'ஆரோக்கிய அதிகரிப்பு', 'स्वस्थ बढ़त'),
 'w_month_n': ('Month {m} (weeks {a}–{b})', 'மாதம் {m} (வாரங்கள் {a}–{b})', 'महीना {m} (हफ़्ते {a}–{b})'),
 'w_st_low': ('Below range', 'வரம்புக்குக் கீழே', 'सीमा से कम'),
 'w_st_ok': ('In range', 'வரம்புக்குள்', 'सीमा में'),
 'w_st_high': ('Above range', 'வரம்புக்கு மேலே', 'सीमा से ज़्यादा'),
 'w_none': ('No weights yet. Add your first one above.', 'இன்னும் எடை எதுவும் இல்லை. மேலே முதல் எடையைச் சேர்க்கவும்.', 'अभी कोई वज़न नहीं। ऊपर अपना पहला वज़न डालें।'),
 'w_del': ('Delete week {w}', 'வாரம் {w}-ஐ நீக்கு', 'हफ़्ता {w} हटाएँ'),
 'w_err_height': ('Enter your height in cm (120–220).', 'உங்கள் உயரத்தை செ.மீ.-இல் உள்ளிடவும் (120–220).', 'अपनी लंबाई सेमी में डालें (120–220)।'),
 'w_err_kg': ('Enter a weight in kg (30–200).', 'எடையை கி.கி.-இல் உள்ளிடவும் (30–200).', 'वज़न किलो में डालें (30–200)।'),
 'w_err_week': ('Choose a week from 1 to 42.', '1 முதல் 42 வரை ஒரு வாரத்தைத் தேர்ந்தெடுக்கவும்.', '1 से 42 तक कोई हफ़्ता चुनें।'),
 'w_chart_label': ('Chart of your weight by week, with the healthy range shaded.',
                   'வாரவாரியாக உங்கள் எடையின் வரைபடம்; ஆரோக்கிய வரம்பு நிழலிடப்பட்டுள்ளது.',
                   'हफ़्ते के हिसाब से आपके वज़न का चार्ट; स्वस्थ सीमा छायांकित है।'),
 'w_legend_you': ('Your weight', 'உங்கள் எடை', 'आपका वज़न'),
 'w_legend_range': ('Healthy range', 'ஆரோக்கிய வரம்பு', 'स्वस्थ सीमा'),
 'w_axis_week': ('Week', 'வாரம்', 'हफ़्ता'),
 'w_note': ('A general guide for one baby, based on the US Institute of Medicine (2009). Your doctor may suggest different numbers, especially for twins. Talk to your doctor about your weight.',
            'ஒரு குழந்தைக்கான பொதுவான வழிகாட்டி (US Institute of Medicine, 2009). உங்கள் மருத்துவர் வேறு எண்களைச் சொல்லலாம், குறிப்பாக இரட்டைக் குழந்தைகளுக்கு. உங்கள் எடை பற்றி மருத்துவரிடம் பேசுங்கள்.',
            'एक बच्चे के लिए सामान्य गाइड (US Institute of Medicine, 2009)। आपके डॉक्टर अलग संख्या बता सकते हैं, ख़ासकर जुड़वाँ बच्चों में। अपने वज़न के बारे में डॉक्टर से बात करें।'),
 'w_setup_intro': ('Tell us two things once. Then add your weight every week in one tap.',
                   'இரண்டு விவரங்களை ஒருமுறை சொல்லுங்கள். பிறகு ஒவ்வொரு வாரமும் உங்கள் எடையை எளிதாகச் சேர்க்கலாம்.',
                   'दो बातें एक बार बताएँ। फिर हर हफ़्ते आसानी से अपना वज़न डालें।'),
 'w_today': ("Today's weight (kg)", 'இன்றைய எடை (கி.கி.)', 'आज का वज़न (किलो)'),
 'w_for_week': ('for week {w}', 'வாரம் {w}-க்கு', 'हफ़्ता {w} के लिए'),
 'w_change_week': ('Different week?', 'வேறு வாரமா?', 'कोई और हफ़्ता?'),
 'w_see_all': ('See all weights (week-wise / month-wise)', 'எல்லா எடைகளையும் பார்க்க (வாரவாரியாக / மாதவாரியாக)', 'सभी वज़न देखें (हफ़्ते / महीने के हिसाब से)'),
 'w_tile_latest': ('Latest', 'கடைசி எடை', 'आख़िरी वज़न'),
 'w_tile_gain': ('Gained so far', 'இதுவரை அதிகரிப்பு', 'अब तक बढ़ा'),
 'w_tile_status': ('Healthy range', 'ஆரோக்கிய வரம்பு', 'स्वस्थ सीमा'),
 'w_week_of': ('week {w}', 'வாரம் {w}', 'हफ़्ता {w}'),
 'w_saved': ('Your weights are saved on this phone only.', 'உங்கள் எடைகள் இந்த போனில் மட்டுமே சேமிக்கப்படும்.', 'आपका वज़न सिर्फ़ इसी फ़ोन में सेव होता है।'),
}

# Tracker page privacy line and privacy page sentences: (old, new) per language
TRK_PRIV = {
 'en': ('Your date stays on this phone or computer only (saved in your browser).', 'Your date and weights stay on this phone or computer only (saved in your browser).'),
 'ta': ('நீங்கள் உள்ளிடும் தேதி இந்த போன் அல்லது கணினியில் மட்டுமே', 'நீங்கள் உள்ளிடும் தேதியும் எடைகளும் இந்த போன் அல்லது கணினியில் மட்டுமே'),
 'hi': ('आपकी तारीख सिर्फ़ इसी फ़ोन या कंप्यूटर में (आपके ब्राउज़र में) सेव रहती है।', 'आपकी तारीख और वज़न सिर्फ़ इसी फ़ोन या कंप्यूटर में (आपके ब्राउज़र में) सेव रहते हैं।'),
}
PRIV = {
 'en': [('the date you enter in the pregnancy tracker, your to-do ticks', 'the date and weights you enter in the pregnancy tracker, your to-do ticks'),
        ('the date and to-do ticks in the pregnancy tracker', 'the date, weights and to-do ticks in the pregnancy tracker')],
 'ta': [('கர்ப்ப டிராக்கரில் நீங்கள் உள்ளிடும் தேதி,', 'கர்ப்ப டிராக்கரில் நீங்கள் உள்ளிடும் தேதியும் எடைகளும்,'),
        ('கர்ப்ப டிராக்கரில் உள்ள தேதியும் டிக்குகளும்', 'கர்ப்ப டிராக்கரில் உள்ள தேதி, எடைகள், டிக்குகள்')],
 'hi': [('प्रेग्नेंसी ट्रैकर में डाली गई तारीख़,', 'प्रेग्नेंसी ट्रैकर में डाली गई तारीख़ और वज़न,'),
        ('प्रेग्नेंसी ट्रैकर की तारीख़ और टू-डू टिक', 'प्रेग्नेंसी ट्रैकर की तारीख़, वज़न और टू-डू टिक')],
}

def panel(S):
    return f'''<!--wt--><section class="trk-card wt-card" id="p-weight" aria-labelledby="wt-title"><h2 id="wt-title"><span class="trk-ico" aria-hidden="true">⚖️</span> {S['w_h']}</h2>
<form class="wt-form" id="wt-setup" novalidate><p class="trk-sub">{S['w_setup_intro']}</p><div class="wt-row"><label>{S['w_height']}<input id="wt-h" type="number" inputmode="decimal" min="120" max="220" step="0.1" required></label><label>{S['w_pre']}<input id="wt-pre" type="number" inputmode="decimal" min="30" max="200" step="0.1" required></label></div><button class="btn" type="submit">{S['w_setup_btn']}</button><p class="wt-err" id="wt-setup-err" role="alert"></p></form>
<div id="wt-main" hidden>
<form class="wt-form wt-today" id="wt-add" novalidate><label class="wt-big-l" for="wt-kg">{S['w_today']} <span id="wt-forweek"></span></label><div class="wt-row"><input id="wt-kg" type="number" inputmode="decimal" min="30" max="200" step="0.1" required><button class="btn" type="submit">{S['w_add_btn']}</button></div>
<button type="button" class="wt-link" id="wt-wk-btn">{S['w_change_week']}</button><label class="wt-wk" id="wt-wk-l" hidden>{S['w_week']}<input id="wt-week" type="number" inputmode="numeric" min="1" max="42" step="1" required></label><p class="wt-err" id="wt-err" role="alert"></p></form>
<div class="wt-stats" id="wt-stats" aria-live="polite"></div>
<figure class="wt-chart"><svg id="wt-svg" viewBox="0 0 340 220" role="img" aria-label="{S['w_chart_label']}"></svg><figcaption class="wt-legend"><span class="wt-l-you">{S['w_legend_you']}</span><span class="wt-l-range">{S['w_legend_range']}</span></figcaption></figure>
<details class="wt-all" id="wt-all"><summary>{S['w_see_all']}</summary>
<div class="wt-views" role="group"><button type="button" aria-pressed="true" data-view="week">{S['w_view_week']}</button><button type="button" aria-pressed="false" data-view="month">{S['w_view_month']}</button></div>
<div id="wt-table"></div><p class="wt-bmi" id="wt-bmi"></p><button type="button" class="wt-link" id="wt-edit">{S['w_edit_setup']}</button></details></div>
<p class="trk-note">{S['w_note']}</p><p class="trk-note">{S['w_saved']}</p></section><!--/wt-->'''

OLD_PANEL = re.compile(r'<!--wt-->.*?<!--/wt-->|<div class="trk-card trk-panel" id="p-weight".*?<p class="trk-note">[^<]*</p></div>', re.S)
def block(s, id_):   # one tracker panel: <div class="trk-card trk-panel…" id="p-…"> … up to the next panel / disclaimer
    m = re.search(r'<div class="trk-card trk-panel[^"]*" id="%s".*?(?=\n<div class="trk-card trk-panel|\n<!--wt-->|\n<p class="disclaimer trk-d2")' % id_, s, re.S)
    return m.group(0)
def unpanel(html):   # a tab panel becomes a plain card that is always shown
    return re.sub(r'^(<div class="trk-card) trk-panel([^"]*" id="p-\w+") role="tabpanel" aria-labelledby="t-\w+"( hidden)?>', r'\1 trk-sec\2>', html)

for lang, i in L.items():
    p = os.path.join(REPO, ('' if lang == 'en' else lang + '/') + 'pregnancy-tracker.html'); s = o = rd(p)
    m = re.search(r'<script type="application/json" id="trk-data">(.*?)</script>', s, re.S); D = json.loads(m.group(1)); S = D['s']
    for k in [k for k in S if k.startswith('w_')]: del S[k]   # same key order on a fresh build and a re-run
    for k, v in W.items(): S[k] = v[i]
    s = re.sub(r'(<script type="application/json" id="trk-data">).*?(</script>)', lambda mm: mm.group(1) + json.dumps(D, ensure_ascii=False) + mm.group(2), s, count=1, flags=re.S)
    s = re.sub(r'\n?' + OLD_PANEL.pattern, '', s, count=1, flags=re.S)   # take out the old weight tab / card; it is put back below
    if 'trk-tabs' in s:   # no tabs: every part is its own card, the weight card right under the week
        s = re.sub(r'<div class="trk-tabs" role="tablist".*?</div>\n', '', s, count=1, flags=re.S)
        wk, ck, td = (block(s, x) for x in ('p-week', 'p-checks', 'p-todo'))
        new = '\n'.join([unpanel(wk).replace('>\n<div class="trk-week">', f'>\n<h2><span class="trk-ico" aria-hidden="true">📅</span> {S["v4_tab_week"]}</h2>\n<div class="trk-week">', 1),
                         unpanel(ck).replace('><h2>', f'><h2><span class="trk-ico" aria-hidden="true">🩺</span> ', 1),
                         unpanel(td).replace('><h2 id="r-todo-h">', '><h2><span class="trk-ico" aria-hidden="true">✅</span> <span id="r-todo-h"></span>', 1)])
        s = s.replace(wk + '\n' + ck + '\n' + td, new, 1)
    s = s.replace('\n\n<p class="disclaimer trk-d2"', '\n<p class="disclaimer trk-d2"')
    s = re.sub(r'(<div class="trk-card trk-sec[^"]*" id="p-week">)', lambda mm: panel(S) + '\n' + mm.group(1), s, count=1)
    if 'weight.js' not in s:
        s = re.sub(r'(<script src="(?:\.\./)?tracker\.js" defer></script>)', lambda mm: mm.group(1) + mm.group(1).replace('tracker.js', 'weight.js'), s, count=1)
    old, new = TRK_PRIV[lang]
    if new not in s: assert old in s, (lang, 'tracker privacy line'); s = s.replace(old, new, 1)
    assert 'trk-tabs' not in s and s.count('id="p-weight"') == 1 and 'weight.js' in s and 'id="p-todo"' in s
    if s != o: wr(p, s); LOG.append('tracker layout + weight card: ' + os.path.relpath(p, REPO))

    p = os.path.join(REPO, ('' if lang == 'en' else lang + '/') + 'privacy.html'); s = o = rd(p)
    for old, new in PRIV[lang]:
        if new in s: continue
        assert old in s, (lang, old); s = s.replace(old, new, 1)
    if s != o: wr(p, s); LOG.append('privacy updated: ' + os.path.relpath(p, REPO))
print('\n'.join(LOG)); print(len(LOG), 'changes')
