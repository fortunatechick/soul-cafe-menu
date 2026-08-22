"""
Build the link-preview (OpenGraph) image from the logo.

    python scripts/make-og.py

Writes src/app/opengraph-image.jpg, which Next serves as the og:image via its
file convention — WhatsApp, iMessage, Slack and Twitter all read it when the
link is shared.

Two things drive the choices here. The logo is a transparent PNG, and WhatsApp
composites transparency against an unpredictable colour — the artwork's dark
navy detail would vanish on a white fill — so the site background is baked in.
And WhatsApp skips previews over roughly 300 KB, so this is a JPEG rather than a
PNG of a 1200x630 canvas.
"""

import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGO = os.path.join(ROOT, 'public', 'soul-logo-bgreemoved-upscaled.png')
OUT = os.path.join(ROOT, 'src', 'app', 'opengraph-image.jpg')

W, H = 1200, 630              # the aspect every scraper crops least
BG = (0x0d, 0x22, 0x33)       # --bg-primary
LOGO_WIDTH_PCT = 0.60

canvas = Image.new('RGB', (W, H), BG)

logo = Image.open(LOGO).convert('RGBA')
target_w = int(W * LOGO_WIDTH_PCT)
target_h = round(logo.height * target_w / logo.width)
logo = logo.resize((target_w, target_h), Image.LANCZOS)

canvas.paste(logo, ((W - target_w) // 2, (H - target_h) // 2), logo)
canvas.save(OUT, 'JPEG', quality=88, optimize=True, progressive=True)

kb = os.path.getsize(OUT) // 1024
print(f'written : {OUT}')
print(f'  canvas: {W}x{H} on #%02x%02x%02x' % BG)
print(f'  logo  : {target_w}x{target_h} centred')
print(f'  size  : {kb} KB  ({"under" if kb < 300 else "OVER"} WhatsApp\'s ~300 KB limit)')
