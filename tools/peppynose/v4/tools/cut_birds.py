"""Cut the two parrots and the perch out of the REAL Peppynose logo (/logo.png) pixels. No redrawing.
Usage: python3 cut_birds.py /path/to/logo.png OUTDIR"""
import sys
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGBA')
BOX = (127, 0, 449, 346)            # bird + perch area of the 640x482 logo (above the lettering)
art = im.crop(BOX); W, H = art.size; px = art.load()
SPLIT = 258 - BOX[0]                 # the heart's centre line: left = baby parrot, right = mother parrot
def is_perch(x, y, p):
    X = x + BOX[0]
    r, g, b, a = p
    if not (a > 0 and 206 <= y <= 250 and (X < 262 or X > 330) and g < 45): return False
    return (80 <= r <= 160 and b >= 140) or (a < 250 and r <= 255 and b >= 60)   # solid purple, or its anti-aliased edge
layers = {k: Image.new('RGBA', (W, H)) for k in ('perch', 'baby', 'mother')}
L = {k: v.load() for k, v in layers.items()}
for y in range(H):
    for x in range(W):
        p = px[x, y]
        if p[3] == 0: continue
        k = 'perch' if is_perch(x, y, p) else ('baby' if x < SPLIT else 'mother')
        L[k][x, y] = p
for k, v in layers.items():
    v.save(f'{out}/bird-{k}.png'); v.save(f'{out}/bird-{k}.webp', lossless=True)
print('size', W, H)
