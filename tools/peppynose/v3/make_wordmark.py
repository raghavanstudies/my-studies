#!/usr/bin/env python3
"""Cut the real Peppynose wordmark out of the live /logo.png (640x482) -> images/logo-wordmark.webp + .png (640x131).
Nothing is redrawn: rows 351-481 of logo.png are copied as-is; only the parrot's tail tips that dip into that strip
(x 129-446, y 351-369, no letter pixels there) are made transparent.  Usage: python3 tools/make_wordmark.py /path/to/repo   (needs Pillow)"""
import sys, os
from PIL import Image
repo = sys.argv[1] if len(sys.argv) > 1 else '.'
logo = Image.open(os.path.join(repo, 'logo.png')).convert('RGBA')
assert logo.size == (640, 482), logo.size
w = logo.crop((0, 351, 640, 482))
px = w.load()
for y in range(0, 369 - 351 + 1):
    for x in range(129, 447):
        px[x, y] = (0, 0, 0, 0)
os.makedirs(os.path.join(repo, 'images'), exist_ok=True)
w.save(os.path.join(repo, 'images', 'logo-wordmark.png'), optimize=True)
w.save(os.path.join(repo, 'images', 'logo-wordmark.webp'), 'WEBP', lossless=True, method=6)
print('wrote images/logo-wordmark.webp and .png', w.size)
