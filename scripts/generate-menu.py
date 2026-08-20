"""
Rebuild src/data/menu.json from the café's PetPooja area-wise price export.

The xlsx is newer than the CSV export and carries three things the CSV did not:
per-item ExposeToOnline, per-channel availability, and the PetPooja ItemID.
Variations arrive as separate rows suffixed "(Regular)", "(Large)", etc. and are
folded back into one item here.
"""

import json, re, unicodedata, hashlib, collections
import openpyxl

XLSX = r'C:/Users/omcha/Downloads/Item_AreawisePrice_388482.xlsx'
CATEGORY_REPORT = r'C:/Users/omcha/Downloads/soul files/Category_Report.csv'
OUT = r'D:/SOUL Claude/src/data/menu.json'

# PetPooja categories that exist for the POS/other outlets, not the website.
SKIP_CATEGORIES = {'Add-Ons', 'The Joy Pizzateria'}


def slugify(s):
    s = unicodedata.normalize('NFKD', s).lower()
    s = re.sub(r'[^a-z0-9]+', '-', s)
    return s.strip('-')


def uuid_for(key):
    h = hashlib.sha1(('soul-menu:' + key).encode()).digest()
    b = bytearray(h[:16])
    b[6] = (b[6] & 0x0F) | 0x50
    b[8] = (b[8] & 0x3F) | 0x80
    x = bytes(b).hex()
    return f'{x[:8]}-{x[8:12]}-{x[12:16]}-{x[16:20]}-{x[20:]}'


# ---- category display names + ordering, straight from the POS report ----
cat_meta = {}
with open(CATEGORY_REPORT, encoding='utf-8-sig') as fh:
    lines = fh.read().splitlines()
start = next(i for i, l in enumerate(lines) if l.startswith('"Category ID"'))
for line in lines[start + 1:]:
    parts = next(__import__('csv').reader([line]))
    if len(parts) < 4 or not parts[1]:
        continue
    cat_meta[parts[1].strip()] = {
        'display': (parts[2] or '').strip(),
        'rank': int(parts[3]) if parts[3].isdigit() else 999,
    }

wb = openpyxl.load_workbook(XLSX, data_only=True)
ws = wb['in']
rows = [r for r in ws.iter_rows(values_only=True) if r[0] and r[0] != 'ItemID']

COL = dict(item_id=0, category=1, name=2, short=4, desc=6, online=7,
           display=8, price=10, dietary=12, hd_price=13, hd_avail=14)

groups = collections.OrderedDict()   # (category, base name) -> record
skipped = collections.Counter()

for r in rows:
    category = (r[COL['category']] or '').strip()
    if category in SKIP_CATEGORIES:
        skipped['pos-only category'] += 1
        continue
    if (r[COL['online']] or '').strip() != 'Yes':
        skipped['not exposed online'] += 1
        continue
    if category not in cat_meta:
        skipped['unknown category'] += 1
        continue

    pos_name = (r[COL['name']] or '').strip()
    display = (r[COL['display']] or '').strip()
    price = int(r[COL['price']] or 0)
    if not price:
        skipped['zero price'] += 1
        continue

    # The size/choice lives in ItemName only: "Cappuccino (Large)".
    # OnlineDisplayName is already the clean base name.
    m = re.match(r'^(.*?)\s*\(([^()]+)\)$', pos_name)
    variation = m.group(2).strip() if m else None
    base = display or (m.group(1).strip() if m else pos_name)

    key = (category, base)
    rec = groups.setdefault(key, {
        'category': category,
        'name': base,
        'description': '',
        'variations': [],
        'prices': [],
        'short_codes': [],
        'item_ids': [],
        'hd_avail': [],
        'veg': True,
    })

    desc = (r[COL['desc']] or '').strip()
    if desc and not rec['description']:
        rec['description'] = re.sub(r'\s+', ' ', desc)

    rec['prices'].append(price)
    rec['item_ids'].append(str(r[COL['item_id']]))
    if r[COL['short']]:
        rec['short_codes'].append(str(r[COL['short']]).strip())
    rec['hd_avail'].append((r[COL['hd_avail']] or '').strip() == 'Yes')
    rec['veg'] = (r[COL['dietary']] or 'veg').strip().lower() != 'nonveg'

    if variation and not any(v['name'] == variation for v in rec['variations']):
        rec['variations'].append({'name': variation, 'price': price,
                                  'posItemId': str(r[COL['item_id']])})

buckets = collections.defaultdict(list)

for (category, base), rec in groups.items():
    item = {
        'id': uuid_for(f'{base}|{category}'),
        'slug': slugify(base),
        'name': base,
        'description': rec['description'],
        'price': min(rec['prices']),
        'veg': rec['veg'],
        'available': True,
        'posItemId': rec['item_ids'][0],
        'posShortCode': rec['short_codes'][0] if rec['short_codes'] else '',
    }
    # Items the café does not send out for delivery stay orderable for pickup.
    if not any(rec['hd_avail']):
        item['deliveryAvailable'] = False
    if len(rec['variations']) > 1:
        item['variations'] = [{'name': v['name'], 'price': v['price']} for v in rec['variations']]
    buckets[category].append(item)

categories = []
for category in sorted(buckets, key=lambda c: cat_meta[c]['rank']):
    categories.append({
        'id': slugify(category),
        'name': cat_meta[category]['display'] or category,
        'posCategory': category,
        'items': buckets[category],
    })

menu = {
    'store': {
        'name': 'Soul',
        'tagline': 'Speciality Coffees & Fusion Bakehouse',
        'address': 'Shop 6, Platinum 53, Building 15, West Durvankur CHS, '
                   'Azad Nagar, Andheri West, Mumbai',
    },
    'updatedAt': '2026-08-20',
    'source': 'PetPooja Item_AreawisePrice_388482 export',
    'categories': categories,
}

with open(OUT, 'w', encoding='utf-8') as fh:
    json.dump(menu, fh, indent=2, ensure_ascii=False)
    fh.write('\n')

total = sum(len(c['items']) for c in categories)
print(f'categories: {len(categories)}  items: {total}')
for c in categories:
    n_var = sum(1 for i in c['items'] if 'variations' in i)
    n_pick = sum(1 for i in c['items'] if i.get('deliveryAvailable') is False)
    extra = []
    if n_var:
        extra.append(f'{n_var} with options')
    if n_pick:
        extra.append(f'{n_pick} pickup-only')
    print(f"  {c['name']:<28} {len(c['items']):>3}   {', '.join(extra)}")
print('skipped rows:', dict(skipped))
