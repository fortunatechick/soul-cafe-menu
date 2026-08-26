"""
Build a descriptions workbook for the menu, from the kitchen recipe sheet.

    python scripts/generate-descriptions.py

Reads three things:
  * the recipe workbook (ingredients + method per dish)
  * src/data/menu.json (the live menu, carrying the PetPooja ItemIDs)
and writes an .xlsx keyed on those ItemIDs, with a generated description,
key ingredients, flavour tags and a type for every menu item.

Descriptions are composed from the actual recipe, never invented. Where no
recipe matches, the row says so rather than guessing — a plausible-sounding
description for a dish nobody can find the recipe for is worse than a blank.
"""

import json
import os
import re
import unicodedata
from difflib import SequenceMatcher

import nutrition
import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RECIPES = r'C:/Users/omcha/Downloads/soulsdaasda/SOUL  RECIPE - FOR OM.xlsx'
MENU = os.path.join(ROOT, 'src', 'data', 'menu.json')
OUT = os.path.join(ROOT, 'SOUL-menu-descriptions.xlsx')
TRAITS = os.path.join(ROOT, 'src', 'data', 'item-traits.json')

LIVE_SHEETS = ['DRINKS', 'FOOD RECIPES', 'MASTER RECIPES', 'Fest Recipes']

# ---------------------------------------------------------------- parsing ---

QTY = re.compile(r'\d')
BANNER = re.compile(r'^(cold|hot|drinks?|food|recipes?|method|quantity|ingredients?|[A-Z][A-Z \-&/]{3,})$')

# Rows that are really instructions, not dish names. Without this the parser
# invents items called "STEP 2", "Mix Well" and "Cut the wrap into two parts."
FRAGMENT = re.compile(
    r"^(step.*|steps|mix\s+well.*|ready to serve.*|sop|all beans|black pepper)$", re.I)

# Verbs that open an instruction rather than name a dish.
INSTRUCTION = re.compile(
    r"^(cut|fold|put|to make|remove|place|take|pour|add|heat|blend|use|whip|serve|"
    r"garnish|finish|repeat|keep|store|fry|assemble|top|pull|strain|shake|stir|for)",
    re.I)


def is_fragment(label):
    if FRAGMENT.match(label) or INSTRUCTION.match(label):
        return True
    # a sentence, not a name
    return label.endswith('.') and len(label.split()) > 3


def norm(s):
    s = unicodedata.normalize('NFKD', str(s or '')).lower()
    s = re.sub(r'\(.*?\)', ' ', s)
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    return ' '.join(s.split())


def parse_recipes(path=RECIPES):
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    items, current = {}, None

    for sheet in LIVE_SHEETS:
        if sheet not in wb.sheetnames:
            continue
        for row in wb[sheet].iter_rows(values_only=True):
            cells = [('' if c is None else str(c).strip()) for c in row]
            first = cells[0] if cells else ''
            rest = cells[1:8]
            if not first:
                continue

            if first.lower().startswith(('recipe', 'method', '-')) or len(first) > 90:
                if current:
                    items[current]['method'] += ' ' + re.sub(r'\s+', ' ', first)
                continue

            if any(QTY.search(c) for c in rest if c):
                if current:
                    qty = next((c for c in rest if c), '')
                    items[current]['ingredients'].append((first, re.sub(r'\s+', ' ', qty)))
                continue

            label = re.sub(r'\s+', ' ', first).strip()
            if BANNER.match(label) or len(label) < 3:
                current = None
                continue
            if is_fragment(label):
                # A sub-step inside the dish that is already open ("For Cold
                # Foam", "Use Frother to Whip"). Keep the dish open — the
                # ingredients that follow still belong to it.
                if current:
                    items[current]['method'] += ' ' + label
                continue
            items.setdefault(label, {'name': label, 'sheet': sheet, 'ingredients': [], 'method': ''})
            current = label

    for v in items.values():
        v['method'] = re.sub(r'\s+', ' ', v['method']).strip(' -')
    return {k: v for k, v in items.items() if v['ingredients'] or len(v['method']) > 40}


# --------------------------------------------------------------- matching ---

def similarity(a, b):
    """a, b already normalised. Length-aware, so a short recipe name sitting
    inside a long combo name is not treated as the same dish."""
    if a == b:
        return 1.0
    ta, tb = set(a.split()), set(b.split())
    if not ta or not tb:
        return 0.0
    jac = len(ta & tb) / len(ta | tb)
    seq = SequenceMatcher(None, a, b).ratio()
    short, long_ = sorted((a, b), key=len)
    if short in long_ and len(short) / len(long_) >= 0.78:
        return max(seq, 0.92)
    return 0.65 * seq + 0.35 * jac


# Menu item name -> recipe block name, for pairs no similarity score can find
# because the two sheets simply use different words for the same dish.
ALIASES = {
    'ethopian pour over': 'Whisky/Ethiopian/Tanzanian Hot Pour Over',
    'tanzanian pour over': 'Whisky/Ethiopian/Tanzanian Hot Pour Over',
    'manual brew pour over': 'Whisky/Ethiopian/Tanzanian Hot Pour Over',
    'whisky barrel aged po iced': 'Whisky/Ethiopian/Tanzanian Iced Pour Over',
    'signature filter coffee': 'South Indian Filter Coffee',
    'fillter coffee': 'South Indian Filter Coffee',
    'cococnut signature filter coffee': 'Coconut Filter Coffee',
    'coconut iced filter coffee': 'Coconut Filter Coffee',
    # 'Matcha Blend' is a base whose parsed rows carry no matcha at all, so
    # aliasing the matcha drinks to it produced descriptions naming espresso and
    # no matcha. Left unaliased — they fall back to the accurate POS wording.
    'strawberry cold foam matcha': 'Strawberry Matcha',
    'sea salt mocha': 'Mocha hot / Sea Salt Mocha hot',
    'viral matilda soul cake': 'Matilda Soul Cake Regular',
    'swiss milk chocolate soul cake': 'Swiss milk chocolate Regular',
    'veg chilly cheese toast': 'Chilly Cheese Veggies Toast / Cheese Garlic Toast',
    'chilli chesse toast': 'Chilly Cheese Veggies Toast / Cheese Garlic Toast',
    'samosa quesadilla with soul in house dip': 'Samosa Quesadilla',
    'paneer tikka wrap': 'Tandoori Paneer Wrap',
    '4 pm purple tea': '4 pm Purple Tea - Hibiscus and Butterfly Pea Tea',
    'apple crumble pie latte': 'Apple Crumble Pie Latte Iced',
    'americano': 'Hot Americano',
    'soul cold coffee': 'Soul Cold Coffee',
    'classic cold coffee': 'Soul Cold Coffee',
}

# --------------------------------------------------------------- taxonomy ---

BEVERAGE_CATS = {
    'Hot Bevarages', 'Iced Bevarages', 'Cold Brews', 'Soul Specials Bevarages',
    'Matcha', 'Tea', 'Ice Tea', 'Frappes',
}
DESSERT_CATS = {'Desserts', 'Cookies', 'Muffins', 'Croissants', 'Soul Cake (Bowl Cake)'}
FOOD_CATS = {
    'Toast', 'Soul Special Fusion Food', 'Bagels', 'Croissant Sandwiches',
    'Sourdough Sandwiches', 'Wraps', 'Burgers', 'Pizza Flat Breads',
    'Fries and Pockets', 'Puffs', 'Protein Series',
}
ADDON_CATS = {'Dips', 'Alternative Milks'}
COMBO_CATS = {'Soul Combos', 'Monsoon Menu'}

DESSERT_WORDS = re.compile(r'cheesecake|cake|cookie|brownie|muffin|croissant|tiramisu|pizookie|truffle|loaf|pie|dessert|waffle')
DRINK_WORDS = re.compile(r'coffee|latte|mocha|espresso|americano|cappuccino|brew|frappe|matcha|tea|chai|aamras|juice|cloud|soda|shakerato|cascara|milk')
FOOD_WORDS = re.compile(r'toast|bun|pizza|burger|wrap|bagel|sandwich|fries|taco|maggi|quesadilla|puff|knots|crostini')


def classify(item, pos_category):
    name = item['name'].lower()
    if pos_category in COMBO_CATS or re.search(r'\+|\band\b(?=.*\b(coffee|chai|latte|tea)\b)', name):
        return 'Combo'
    if pos_category in ADDON_CATS:
        return 'Add-on'
    if pos_category in BEVERAGE_CATS:
        return 'Beverage'
    if pos_category in DESSERT_CATS:
        return 'Dessert'
    if pos_category in FOOD_CATS:
        return 'Food'
    # Seasonal categories mix everything — read the item itself.
    if DESSERT_WORDS.search(name):
        return 'Dessert'
    if DRINK_WORDS.search(name):
        return 'Beverage'
    if FOOD_WORDS.search(name):
        return 'Food'
    return 'Other'


FLAVOURS = {
    'chocolate': re.compile(r'chocolate|choco|cocoa|coco powder|nutella|mocha|biscoff|truffle'),
    'fruity': re.compile(r'mango|strawberry|blueberry|watermelon|litchi|orange|peach|pineapple|apple|banana|lemon|berry|aamras|coconut'),
    'nutty': re.compile(r'hazelnut|almond|pistachio|walnut|peanut|nutella'),
    'caramel/vanilla': re.compile(r'caramel|butterscotch|toffee|vanilla|tiramisu|condensed milk|milk maid'),
    'spiced': re.compile(r'masala|ginger|cinnamon|nutmeg|turmeric|kadak|chai|qahva|cardamom|clove|thecha|chilli'),
    'savoury': re.compile(r'cheese|paneer|mushroom|garlic|pesto|hummus|falafel|tikka|samosa|vada|patty|mayo|olive'),
    'floral/herbal': re.compile(r'blue pea|lavender|chamomile|rose|mint|hibiscus|purple tea|green tea'),
}

SKIP_INGREDIENTS = re.compile(r'^(ice|water|hot water|cold water|salt|oil|garnish)$', re.I)


def flavour_tags(text, kind=None):
    tags = [name for name, pattern in FLAVOURS.items() if pattern.search(text.lower())]
    # Cream cheese in a cheesecake, mascarpone in a tiramisu: the pattern reads
    # these as savoury, which is exactly backwards for a dessert.
    if kind == 'Dessert':
        tags = [t for t in tags if t != 'savoury']
    return tags


def temperature(item, pos_category, blob):
    name = item['name'].lower()
    if pos_category in {'Iced Bevarages', 'Cold Brews', 'Ice Tea', 'Frappes'} or re.search(r'\biced?\b|cold|frappe|sparkling|chilled', name):
        return 'Cold'
    if pos_category in {'Hot Bevarages', 'Tea', 'Toast'} or re.search(r'\bhot\b|warm', name):
        return 'Hot'
    # "ice" as a bare substring also matches spice, slice and juice, and a
    # recipe that mentions ice says nothing about how the food is served -
    # so this last resort is word-bounded and beverages only.
    if pos_category in BEVERAGE_CATS and re.search(r'(?<![a-z])ice(?![a-z])', blob.lower()):
        return 'Cold'
    return ''


def describe(item, recipe, kind, temp):
    """Compose a sentence from the actual ingredients. Never invents flavour."""
    if not recipe:
        return ''
    notable = [n for n, _ in recipe['ingredients'] if not SKIP_INGREDIENTS.match(n.strip())]
    seen, uniq = set(), []
    for n in notable:
        key = n.lower().strip()
        if key in seen:
            continue
        seen.add(key)
        uniq.append(re.sub(r'\s+', ' ', n).strip())
    if not uniq:
        return ''

    lead = uniq[:5]
    if len(lead) == 1:
        body = lead[0]
    else:
        body = ', '.join(lead[:-1]) + ' and ' + lead[-1]

    if kind == 'Beverage' and temp == 'Cold':
        return f'{body}, served over ice.'
    if kind == 'Beverage' and temp == 'Hot':
        return f'{body}, served hot.'
    return f'{body}.'


# ------------------------------------------------------------------ build ---

def build():
    recipes = parse_recipes()
    rnorm = {norm(k): k for k in recipes}

    menu = json.load(open(MENU, encoding='utf-8'))
    rows, used_recipes = [], set()

    for category in menu['categories']:
        for item in category['items']:
            n = norm(item['name'])
            best, best_score = None, 0.0
            alias = ALIASES.get(n)
            if alias and alias in recipes:
                best, best_score = alias, 0.95
            else:
                for rn, orig in rnorm.items():
                    s = similarity(n, rn)
                    if s > best_score:
                        best, best_score = orig, s

            if best_score >= 0.88:
                confidence, recipe = 'Exact' if best_score >= 0.99 else 'Close', recipes[best]
            elif best_score >= 0.70:
                confidence, recipe = 'Review', recipes[best]
            else:
                confidence, recipe, best = 'No recipe found', None, None

            if recipe:
                used_recipes.add(best)

            pos_cat = category.get('posCategory', category['name'])
            kind = classify(item, pos_cat)

            ingredients = recipe['ingredients'] if recipe else []
            blob = ' '.join([item['name'], item.get('description', '')] +
                            [n for n, _ in ingredients] +
                            [recipe['method'] if recipe else ''])
            temp = temperature(item, pos_cat, blob)

            key_ing = ', '.join(
                dict.fromkeys(n.strip() for n, _ in ingredients if not SKIP_INGREDIENTS.match(n.strip()))
            )
            full = '; '.join(f'{n.strip()} — {q}'.strip(' —') for n, q in ingredients)

            # Only where a recipe actually matched, and only where enough of it
            # was understood - see scripts/nutrition.py.
            nut = nutrition.estimate(recipe) if recipe and confidence != 'Review' else None

            rows.append({
                'id': item['id'],
                'variation_ids': ', '.join(v['id'] for v in item.get('variations', [])),
                'name': item['name'],
                'category': category['name'],
                'type': kind,
                'price': item['price'],
                'description': describe(item, recipe, kind, temp),
                'pos_description': item.get('description', ''),
                'final_description': (describe(item, recipe, kind, temp)
                                      or item.get('description', '')),
                'key_ingredients': key_ing,
                'flavours': ', '.join(flavour_tags(blob, kind)),
                'temperature': temp,
                'kcal': nut['kcal'] if nut else '',
                'sugar_g': nut['sugar'] if nut else '',
                'nutrition_coverage': f"{int(nut['coverage'] * 100)}%" if nut else '',
                'full_recipe': full,
                'method': (recipe['method'] if recipe else '')[:900],
                'confidence': confidence,
                'matched': best or '',
            })

    leftovers = sorted(k for k in recipes if k not in used_recipes)
    return rows, leftovers, recipes


COLUMNS = [
    ('PetPooja Item ID', 'id', 16),
    ('Variation IDs', 'variation_ids', 20),
    ('Item Name', 'name', 40),
    ('POS Category', 'category', 22),
    ('Type', 'type', 11),
    ('Price', 'price', 8),
    ('Description (use this)', 'final_description', 60),
    ('Generated From Recipe', 'description', 52),
    ('Existing POS Description', 'pos_description', 44),
    ('Key Ingredients', 'key_ingredients', 46),
    ('Flavour Tags', 'flavours', 26),
    ('Temperature', 'temperature', 12),
    ('Approx kcal', 'kcal', 12),
    ('Approx sugar (g)', 'sugar_g', 16),
    ('Nutrition Confidence', 'nutrition_coverage', 20),
    ('Full Recipe', 'full_recipe', 60),
    ('Method', 'method', 60),
    ('Recipe Match', 'confidence', 16),
    ('Matched Recipe Name', 'matched', 34),
]

HEAD_FILL = PatternFill('solid', fgColor='0D2233')
HEAD_FONT = Font(name='Arial', bold=True, color='FFFFFF', size=10)
BODY = Font(name='Arial', size=10)
WARN = Font(name='Arial', size=10, color='B45309')


def write(rows, leftovers):
    wb = openpyxl.Workbook()

    ws = wb.active
    ws.title = 'Descriptions'
    for c, (header, _, width) in enumerate(COLUMNS, start=1):
        cell = ws.cell(row=1, column=c, value=header)
        cell.fill, cell.font = HEAD_FILL, HEAD_FONT
        cell.alignment = Alignment(vertical='center', wrap_text=True)
        ws.column_dimensions[get_column_letter(c)].width = width
    ws.row_dimensions[1].height = 30

    for r, row in enumerate(rows, start=2):
        for c, (_, key, _) in enumerate(COLUMNS, start=1):
            cell = ws.cell(row=r, column=c, value=row[key])
            cell.font = WARN if row['confidence'] == 'No recipe found' else BODY
            cell.alignment = Alignment(vertical='top', wrap_text=key in
                                       {'description', 'final_description', 'key_ingredients',
                                        'full_recipe', 'method', 'pos_description'})
    ws.freeze_panes = 'D2'
    ws.auto_filter.ref = f'A1:{get_column_letter(len(COLUMNS))}{len(rows) + 1}'

    # --- recipes with no menu item ---
    ws2 = wb.create_sheet('Recipes not on the menu')
    for c, header in enumerate(['Recipe name', 'Sheet', 'Ingredients'], start=1):
        cell = ws2.cell(row=1, column=c, value=header)
        cell.fill, cell.font = HEAD_FILL, HEAD_FONT
    ws2.column_dimensions['A'].width = 46
    ws2.column_dimensions['B'].width = 18
    ws2.column_dimensions['C'].width = 90
    for r, name in enumerate(leftovers, start=2):
        rec = RECIPE_CACHE[name]
        ws2.cell(row=r, column=1, value=name).font = BODY
        ws2.cell(row=r, column=2, value=rec['sheet']).font = BODY
        ws2.cell(row=r, column=3, value=', '.join(n for n, _ in rec['ingredients'])).font = BODY

    # --- legend ---
    ws3 = wb.create_sheet('Read me')
    ws3.column_dimensions['A'].width = 24
    ws3.column_dimensions['B'].width = 104
    notes = [
        ('What this is', 'One row per live menu item, keyed on the PetPooja ItemID, with a description built from the kitchen recipe sheet.'),
        ('', ''),
        ('Description (use this)', 'The column to feed the recommendation engine. Uses the recipe-derived description where one exists, and falls back to the existing POS description otherwise.'),
        ('Generated From Recipe', 'Composed from the recipe ingredients only. Nothing is invented. Blank means no recipe matched.'),
        ('Key Ingredients', 'Ingredients minus water, ice and salt. This is the most useful column for the recommendation engine.'),
        ('Flavour Tags', 'Derived from the item name, description, ingredients and method.'),
        ('Type', 'Beverage / Food / Dessert / Add-on / Combo. From the POS category, with per-item overrides for the seasonal sections that mix all of them.'),
        ('', ''),
        ('Recipe Match', 'Exact = names identical. Close = confidently the same dish. Review = probable, please check. No recipe found = nothing matched, row left blank rather than guessed.'),
        ('Rows in amber', 'No recipe was found for that item.'),
        ('', ''),
        ('Variation IDs', 'PetPooja treats each size as its own item; these are the sizes belonging to that row.'),
        ('Recipes not on the menu', 'Recipe blocks with no matching live menu item — discontinued dishes, sub-recipes (syrups, sauces) and spelling drift.'),
    ]
    for r, (a, b) in enumerate(notes, start=1):
        ca = ws3.cell(row=r, column=1, value=a)
        ca.font = Font(name='Arial', size=10, bold=bool(a))
        cb = ws3.cell(row=r, column=2, value=b)
        cb.font = BODY
        cb.alignment = Alignment(wrap_text=True, vertical='top')

    wb.save(OUT)


def engine_kind(row):
    """Map the workbook Type to the vocabulary the recommender asks about."""
    name = row['name'].lower()
    blob = f"{name} {row['key_ingredients']} {row['final_description']}".lower()
    t = row['type']
    if t in ('Food', 'Combo'):
        return 'food' if t == 'Food' else 'combo'
    if t == 'Dessert':
        return 'sweet'
    if t == 'Add-on':
        return 'addon'
    if t == 'Beverage':
        if re.search(r'matcha|chai|tea|hibiscus|chamomile|blue pea', blob):
            return 'tea'
        if re.search(r'coffee|espresso|latte|mocha|americano|cappuccino|brew|frappe|cascara|shakerato|cortado|macchiato|affogato', blob):
            return 'coffee'
        return 'drink'          # hot chocolate, lime soda, aamras
    return 'other'


# The workbook labels read well for people; the engine asks in its own words.
FLAVOUR_ALIAS = {'caramel/vanilla': 'caramel', 'floral/herbal': 'floral'}


def write_traits(rows):
    out = {}
    for row in rows:
        flavours = [FLAVOUR_ALIAS.get(f, f) for f in
                    (x.strip() for x in row['flavours'].split(',')) if f]
        out[row['id']] = {
            'kind': engine_kind(row),
            'temp': row['temperature'].lower() or None,
            'flavours': flavours,
            # lower-cased ingredient text: lets the engine match a flavour even
            # where no tag was assigned
            'ingredients': row['key_ingredients'].lower(),
            'type': row['type'],
        }
        if row['kcal'] != '':
            out[row['id']]['kcal'] = row['kcal']
            out[row['id']]['sugar'] = row['sugar_g']
        for vid in (v.strip() for v in row['variation_ids'].split(',') if v.strip()):
            out[vid] = out[row['id']]

    with open(TRAITS, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, indent=0, ensure_ascii=False, sort_keys=True)
        fh.write(chr(10))
    return out


if __name__ == '__main__':
    rows, leftovers, RECIPE_CACHE = build()
    write(rows, leftovers)
    traits = write_traits(rows)

    import collections
    print(f'wrote {OUT}')
    print(f'  rows            : {len(rows)}')
    print('  by type         :', dict(collections.Counter(r['type'] for r in rows)))
    print('  by match        :', dict(collections.Counter(r['confidence'] for r in rows)))
    print(f'  from recipe     : {sum(1 for r in rows if r["description"])}')
    print(f'  usable overall  : {sum(1 for r in rows if r["final_description"])} of {len(rows)}')
    print(f'  still blank     : {sum(1 for r in rows if not r["final_description"])}')
    print(f'  recipes unused  : {len(leftovers)}')
    print()
    print(f'wrote {TRAITS}')
    print('  trait entries   :', len(traits))
    print('  engine kinds    :', dict(collections.Counter(t['kind'] for t in traits.values())))
    print('  with flavours   :', sum(1 for t in traits.values() if t['flavours']))
    print('  with temperature:', sum(1 for t in traits.values() if t['temp']))
    print('  with calories   :', sum(1 for t in traits.values() if 'kcal' in t))
