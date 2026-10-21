#!/usr/bin/env python3
"""Generate the 39 "Scan to buy" QR codes: images/qr/{en,ta,hi}/<slug>.svg and .png (ECC level H, 4-module quiet zone, black on white).
Usage: pip install segno ; python3 tools/make_qr.py /path/to/repo      (reads tools/products_v3.json next to this script)"""
import json, os, re, sys
import segno
HERE = os.path.dirname(os.path.abspath(__file__))
repo = sys.argv[1] if len(sys.argv) > 1 else '.'
P = json.load(open(os.path.join(HERE, 'products_v3.json'), encoding='utf-8'))
for lang in ['en', 'ta', 'hi']:
    out = os.path.join(repo, 'images', 'qr', lang); os.makedirs(out, exist_ok=True)
    for p in P:
        if not p['qr']: continue                     # coming-soon / out-of-stock products get no QR
        url = 'https://www.peppynose.com/' + ('' if lang == 'en' else lang + '/') + f"buy/{p['slug']}.html"
        q = segno.make_qr(url, error='h', boost_error=False)
        svg = os.path.join(out, p['slug'] + '.svg')
        q.save(svg, scale=1, border=4, dark='#000000', light='#ffffff', xmldecl=False, nl=False)
        s = open(svg).read(); m = re.search(r'width="(\d+)" height="(\d+)"', s); w = m.group(1)
        s = s.replace(m.group(0), f'width="{w}" height="{w}" viewBox="0 0 {w} {w}" shape-rendering="crispEdges"', 1)
        open(svg, 'w').write(s)                      # viewBox so the SVG scales cleanly to any CSS size
        q.save(os.path.join(out, p['slug'] + '.png'), scale=10, border=4, dark='#000000', light='#ffffff')
        print(lang, p['slug'], url, 'version', q.version, 'ECC', q.error)
