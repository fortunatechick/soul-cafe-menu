"""
Rebuild the web logo from the supplied artwork, on the site's background colour.

The supplied lockup (soul_logo.jpg) sits on #1c3055, while the site background
is #0d2233. Pasting it straight in leaves a visibly lighter navy panel, so the
background is recoloured here. The artwork itself is untouched: same square,
same crop, same lockup — only the flat backdrop changes.

    python scripts/make-logo.py

Method: every pixel of the source is the artwork composited over the old
background at some coverage `a`. Rather than key the background out and
recomposite (which leaves navy fringes around the letterforms), the difference
is applied directly:

    out = src + (1 - a) * (new_bg - old_bg)

At a = 0 that lands exactly on the new background; at a = 1 it leaves the
artwork exactly as drawn; and the anti-aliased edges in between blend without
any halo.
"""

import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'soul_logo.jpg')
OUT = os.path.join(ROOT, 'public', 'soul-logo.png')

NEW_BG = (0x0d, 0x22, 0x33)   # --bg-primary
LO, HI = 12.0, 60.0           # distance from the old background -> coverage ramp

img = Image.open(SRC).convert('RGB')
src = np.asarray(img).astype(np.float32)

old_bg = np.array(img.getpixel((0, 0)), dtype=np.float32)
new_bg = np.array(NEW_BG, dtype=np.float32)

dist = np.sqrt(((src - old_bg) ** 2).sum(axis=2))
alpha = np.clip((dist - LO) / (HI - LO), 0.0, 1.0)[..., None]

out = src + (1.0 - alpha) * (new_bg - old_bg)
out = np.clip(out, 0, 255).astype(np.uint8)

Image.fromarray(out).save(OUT, 'PNG', optimize=True)

corner = tuple(int(v) for v in out[0, 0])
print(f'source     : {img.size[0]}x{img.size[1]}  background #%02x%02x%02x' % tuple(int(v) for v in old_bg))
print(f'written    : {OUT}')
print(f'  size     : {os.path.getsize(OUT) // 1024} KB, unchanged crop')
print(f'  corner   : #%02x%02x%02x  (target #%02x%02x%02x)' % (corner + NEW_BG))
print(f'  artwork  : {int((alpha > 0.5).sum())} px kept at full strength')
