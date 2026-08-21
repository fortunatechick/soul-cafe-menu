"""
Match item photos to menu items, downscale them for the web, and write the
manifest the menu page reads.

Sources: /menu_images and /media (either is fine).
Output:  /public/menu/<slug>.jpg  +  src/data/media-manifest.json

Filenames are matched to menu items by name — case, spacing and punctuation are
ignored, and export suffixes like "_linkedin_post_1200x627" are stripped. Where a
photo's name genuinely differs from the POS name, add an entry to ALIASES rather
than renaming the file, so re-exporting the photos does not break the mapping.

    npm run sync-media

Requires Pillow (`pip install pillow`) for the downscale step. The source photos
are marketing exports around 700 KB each; served straight they would make the
menu page tens of megabytes, so each one is resized to fit the card and written
out as a modest JPEG.
"""

import json
import os
import re
import shutil
import unicodedata

try:
    from PIL import Image
except ImportError:
    Image = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCES = [os.path.join(ROOT, 'menu_images'), os.path.join(ROOT, 'media')]
OUT_DIR = os.path.join(ROOT, 'public', 'menu')
MANIFEST = os.path.join(ROOT, 'src', 'data', 'media-manifest.json')
MENU = os.path.join(ROOT, 'src', 'data', 'menu.json')

EXTS = {'.jpg', '.jpeg', '.png', '.webp', '.avif'}
MAX_WIDTH = 600          # the card thumbnail is 92px; this stays crisp at 3x
JPEG_QUALITY = 82

# Photo name -> exact menu item name, for the cases where they differ.
ALIASES = {
    'avocado sour dough toast': 'Avocado Guacamole Pesto Sourdough Toast',
    'cheesy loaded fries': 'Loaded Fries',
    'coffee butter cookies': 'Coffee Butter Cookies (X2)',
    'falafel wrap': 'Spicy Hummus & Falafel Wrap',
    'garlic knots': 'Garlic Knots With Hot Cheese Dip',
    'hot sea salt mocha': 'Sea Salt Mocha',
    'iced cold brew': 'Classic Cold Brew',
    'pesto pizza': 'Pesto Pizza Flatbread',
    'pizookie': 'Pizookie With Vanilla Icecream',
    'samosa quesidilla': 'Samosa Quesadilla With Soul In-House Dip',
    'signature iced filter coffee': 'Signature Filter Coffee',
}

# Trailing export junk to drop before matching.
SUFFIX_RE = re.compile(
    r'[_\- ]*(linkedin|instagram|facebook|fb|ig)?[_\- ]*(post|story|feed)?'
    r'[_\- ]*\d{3,4}\s*x\s*\d{3,4}$',
    re.I,
)


def slugify(s):
    s = unicodedata.normalize('NFKD', s).lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def clean(stem):
    prev = None
    while prev != stem:
        prev = stem
        stem = SUFFIX_RE.sub('', stem).strip(' _-')
    return stem


menu = json.load(open(MENU, encoding='utf-8'))
items = [i for c in menu['categories'] for i in c['items']]

by_slug = {}
for it in items:
    by_slug.setdefault(it['slug'], []).append(it)

os.makedirs(OUT_DIR, exist_ok=True)
for f in os.listdir(OUT_DIR):
    if not f.startswith('.'):
        os.remove(os.path.join(OUT_DIR, f))

manifest, unmatched, matched = {}, [], []

for src_dir in SOURCES:
    if not os.path.isdir(src_dir):
        continue
    for fname in sorted(os.listdir(src_dir)):
        stem, ext = os.path.splitext(fname)
        if ext.lower() not in EXTS:
            continue

        name = clean(stem)
        target = ALIASES.get(name.lower(), name)
        slug = slugify(target)

        hits = by_slug.get(slug)
        if not hits:
            unmatched.append(fname)
            continue

        out_name = f'{slug}.jpg'
        src_path = os.path.join(src_dir, fname)
        out_path = os.path.join(OUT_DIR, out_name)

        if Image is not None:
            with Image.open(src_path) as im:
                im = im.convert('RGB')
                if im.width > MAX_WIDTH:
                    h = round(im.height * MAX_WIDTH / im.width)
                    im = im.resize((MAX_WIDTH, h), Image.LANCZOS)
                im.save(out_path, 'JPEG', quality=JPEG_QUALITY, optimize=True,
                        progressive=True)
        else:
            shutil.copyfile(src_path, out_path)

        manifest[slug] = f'/menu/{out_name}'
        matched.append((fname, [i['name'] for i in hits],
                        os.path.getsize(src_path), os.path.getsize(out_path)))

with open(MANIFEST, 'w', encoding='utf-8') as fh:
    json.dump(dict(sorted(manifest.items())), fh, indent=2)
    fh.write('\n')

src_kb = sum(m[2] for m in matched) / 1024
out_kb = sum(m[3] for m in matched) / 1024

print(f'matched {len(matched)} photo(s) to {sum(len(m[1]) for m in matched)} menu item(s)')
for fname, names, s, o in matched:
    print(f'  {clean(os.path.splitext(fname)[0]):<32} -> {", ".join(names)}')
print(f'\n{len(manifest)} of {len(items)} menu items now have a photo')
if Image is None:
    print('!! Pillow not installed - photos copied at full size, not downscaled')
else:
    print(f'downscaled {src_kb / 1024:.1f} MB -> {out_kb / 1024:.1f} MB')

if unmatched:
    print(f'\n{len(unmatched)} photo(s) matched no menu item:')
    for f in unmatched:
        print(f'   {f}')
    print('  Add an ALIASES entry in this script, or check the item exists in menu.json.')
