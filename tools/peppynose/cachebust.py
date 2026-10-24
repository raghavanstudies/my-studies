#!/usr/bin/env python3
"""Peppynose: add ?v=<content hash> to styles.css, tracker.js, weight.js and dash.js links in every page, so phones fetch the new
file as soon as it changes (instead of mixing an old cached file with a new page). Safe to run again; run it LAST:
  ... && python3 -I tools/peppynose/dashboard/apply_dashboard.py peppynose && python3 -I tools/peppynose/cachebust.py peppynose"""
import sys, os, re, hashlib, glob
REPO = os.path.abspath(sys.argv[1])
FILES = ['styles.css', 'tracker.js', 'weight.js', 'dash.js']
V = {f: hashlib.sha256(open(os.path.join(REPO, f), 'rb').read()).hexdigest()[:10] for f in FILES}
pat = re.compile(r'((?:href|src)="(?:\.\./|/)*(' + '|'.join(re.escape(f) for f in FILES) + r'))(?:\?v=[0-9a-f]+)?"')
n = 0
for p in glob.glob(os.path.join(REPO, '**', '*.html'), recursive=True):
    s = open(p, encoding='utf-8').read()
    t = pat.sub(lambda m: f'{m.group(1)}?v={V[m.group(2)]}"', s)
    if t != s: open(p, 'w', encoding='utf-8').write(t); n += 1
print(n, 'pages updated', V)
