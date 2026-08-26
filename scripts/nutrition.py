"""Estimate calories and sugar for a recipe from its ingredient quantities.

The recipe sheet gives real amounts - 549 lines in grams, 257 in millilitres -
so the arithmetic is honest: look each ingredient up in a per-100g table,
scale by the amount, add it up.

What this is NOT is a lab analysis. The table below holds standard reference
values for generic ingredients, not the specific brands the kitchen buys, and a
recipe records what goes into the drink rather than what reaches the customer.
So every figure is reported as an approximation, and an item whose recipe is
mostly unrecognised ingredients reports nothing at all rather than a confident
wrong number.

Values are per 100 g or 100 ml as (kcal, sugar_g).
"""
import re

# Order matters: the first pattern that matches wins, so "coconut milk" and
# "condensed milk" must be tested before plain "milk".
NUTRITION = [
    # --- water, ice, and things that weigh nothing ---
    (r'^ice\b|^ice for|crushed ice', (0, 0)),
    (r'^(hot |cold |warm )?water$|^filter$', (0, 0)),
    (r'soda water|club soda|bisleri|dukes', (0, 0)),
    (r'tonic water', (34, 8.6)),

    # --- coffee and tea ---
    (r'espresso|coffee/ ?espresso|^coffee\b|coffee beans|filter coffee', (2, 0)),
    (r'cold brew|cascara', (2, 0)),
    (r'green tea|black tea|chamomile|blue pea|hibiscus|^tea\b|tea flowers|qahva', (1, 0)),
    (r'matcha', (300, 0)),
    (r'frappe powder', (380, 60)),

    # --- dairy ---
    (r'coconut milk', (230, 3)),
    (r'condensed milk|milk ?maid', (321, 54)),
    (r'almond milk', (17, 0.6)),
    (r'oat milk', (46, 4)),
    (r'soy milk', (43, 3.6)),
    (r'milk foam|^foam$', (62, 4.8)),   # frothed milk, not cream
    (r'whip(ping|ped)? cream|fresh cream|cold foam', (350, 2.9)),
    (r'cream cheese', (350, 4)),
    (r'mascarpone', (430, 3)),
    (r'mozzarella|buffalo mozzarella|buffala mozarella|cheese sauce|cheddar|parmesan|^cheese', (300, 2)),
    (r'paneer', (265, 1.2)),
    (r'yog(h)?urt|curd|hung curd', (60, 4.7)),
    (r'butter milk', (40, 4.8)),
    (r'^milk\b|milk for|full cream milk|regular milk', (62, 4.8)),
    (r'butter', (717, 0.1)),
    (r'ice cream', (207, 21)),

    # --- sugars and syrups ---
    (r'sugar syrup|simple syrup', (260, 65)),
    (r'brown sugar|sugar powder|^sugar\b|castor sugar|icing sugar', (400, 100)),
    (r'jaggery', (383, 85)),
    (r'honey', (304, 82)),
    (r'syrup', (260, 62)),          # vanilla, hazelnut, tiramisu, iced tea, etc.

    # --- chocolate ---
    # The house sauces are spreads let down with water - the master recipe for
    # the biscoff one is half water - so they are nothing like the neat jar.
    (r'(biscoff|nutella|chocolate|caramel|hazelnut) sauce', (250, 30)),
    (r'lotus biscoff sauce|biscoff sauce', (250, 30)),
    (r'biscoff biscuit|biscuit crumbs|lotus biscoff', (480, 35)),
    (r'chocolate sauce|chocolate ganache', (280, 50)),
    (r'dark chocolate|chocolate compound|chocolate ball|chocolate chip', (500, 45)),
    (r'coco(a)? powder', (228, 1.8)),
    (r'nutella', (539, 56)),

    # --- fruit and juice ---
    (r'lemon juice|lime juice', (22, 2.5)),
    (r'orange juice|pineapple juice|apple juice|mango|aamras|watermelon juice', (48, 9)),
    (r'strawberry|blueberry|litchi|peach|banana|pineapple|orange|watermelon', (45, 8)),
    (r'^lemon$|^lime$', (29, 2.5)),

    # --- nuts ---
    (r'hazelnut|almond|walnut|pistachio|peanut|cashew', (600, 4)),

    # --- bakery and bases ---
    (r'sponge cake|^cake\b', (300, 30)),
    (r'cheesecake', (320, 22)),
    (r'croissant', (406, 11)),
    (r'brioche', (330, 8)),
    (r'bagel', (250, 5)),
    (r'sourdough|^bread\b|toast|slice of bread', (265, 3)),
    (r'korean bun|^bun\b', (300, 8)),
    (r'tortilla|wrap', (310, 2)),
    (r'flat ?bread|pizza base|pita', (270, 2)),
    (r'maida|refined flour|all purpose flour|^flour', (364, 0.3)),
    (r'corn flour|corn starch', (380, 0)),
    (r'baking (soda|powder)|yeast|gelatin', (0, 0)),
    (r'^egg', (143, 0.4)),

    # --- savoury ---
    (r'olive oil|sunflower oil|^oil\b|refined oil', (884, 0)),
    (r'garlic butter', (700, 0)),
    (r'mayo|mayonnaise|aioli', (680, 2)),
    (r'pesto', (450, 2)),
    (r'hummus', (170, 0.5)),
    (r'gu(a)?camole|avocado', (160, 1)),
    (r'frozen potato fries|french fries|^fries|potato', (250, 0.5)),
    (r'schezwan|sriracha|hot sauce|chilli sauce', (120, 15)),
    (r'pizza pasta sauce|pasta sauce|tomato sauce|ketchup', (80, 12)),
    (r'thecha|chutney', (100, 1)),
    (r'olives', (115, 0)),
    (r'^corn$|sweet corn', (86, 3)),
    (r'sundried tomato', (213, 12)),
    (r'cherry tomato|^tomato', (18, 2.6)),
    (r'pickled onion|^onion', (40, 4.2)),
    (r'capsicum|bell pepper', (20, 4.2)),
    (r'mushroom', (22, 1)),
    (r'spinach|lettuce|micro ?herbs|microgreens|edible flower|^mint|coriander|parsley|basil|rocket', (15, 0.5)),
    (r'cucumber', (15, 1.7)),
    (r'^garlic|confit garlic', (149, 1)),
    (r'green chilli|jalapeno', (40, 2.4)),
    (r'vinegar', (20, 0.4)),
    (r'falafel', (333, 0)),
    (r'tikka filling|chicken|patty', (200, 1)),

    # --- seasonings: real ingredients, but grams of them at most ---
    (r'salt|pepper|oregano|chilli flakes|cinnamon|nutmeg|ginger|cardamom|'
     r'turmeric|spice|masala|vanilla essence|essence|garnish|sachet', (0, 0)),
]

COMPILED = [(re.compile(p), v) for p, v in NUTRITION]

# Amounts written as a count of things rather than a weight.
PIECE_GRAMS = [
    (re.compile(r'bagel'), 90),
    (re.compile(r'croissant'), 60),
    (re.compile(r'korean bun|brioche|^bun'), 80),
    (re.compile(r'sourdough|bread'), 40),
    (re.compile(r'tortilla|wrap'), 60),
    (re.compile(r'flat ?bread'), 100),
    (re.compile(r'biscoff|biscuit|cookie'), 8),
    (re.compile(r'egg'), 50),
    (re.compile(r'^lemon$|^lime$'), 60),
]

# Units that carry so little they cannot move a calorie count.
NEGLIGIBLE_UNIT = re.compile(
    r'dash|drop|leaves|leaf|sprig|pinch|sachet|garnish|as per|to taste|nos?$', re.I)

SPOON = {'tsp': 5, 'teaspoon': 5, 'teaspoons': 5, 'tbsp': 15, 'tablespoon': 15}


# "Syrup (as per requirement)" is an option the customer may not take, so it
# is not counted in the figure printed on the menu.
OPTIONAL = re.compile(r'as per requirement|if any|if required|optional|to taste', re.I)


def lookup(name):
    """(kcal, sugar) per 100 units, or None if the ingredient is unrecognised."""
    n = re.sub(r'\s+', ' ', str(name or '')).strip().lower()
    n = re.sub(r'\(.*?\)', ' ', n).strip()
    for pattern, value in COMPILED:
        if pattern.search(n):
            return value
    return None


def amount(qty, name):
    """Convert a quantity cell to grams.

    Returns (grams, known). `known` is False when the amount cannot be read at
    all, which is what stops a half-understood recipe reporting a figure.
    """
    q = re.sub(r'\s+', ' ', str(qty or '')).strip().lower()
    if not q:
        return 0.0, False
    if NEGLIGIBLE_UNIT.search(q):
        return 0.0, True

    # "4-5 drops", "2 pieces or 30 gm" - take the first number, prefer grams.
    grams = re.search(r'([\d.]+)\s*(?:gm|gms|gram|grams|g)\b', q)
    if grams:
        return float(grams.group(1)), True
    kg = re.search(r'([\d.]+)\s*kg\b', q)
    if kg:
        return float(kg.group(1)) * 1000, True
    ml = re.search(r'([\d.]+)\s*(?:ml|millilitre)', q)
    if ml:
        return float(ml.group(1)), True     # 1 ml is close enough to 1 g here
    litre = re.search(r'([\d.]+)\s*(?:l|litre|ltr)\b', q)
    if litre:
        return float(litre.group(1)) * 1000, True

    spoon = re.search(r'([\d.]+)\s*/?\s*([\d.]*)\s*(tsp|tbsp|teaspoons?|tablespoons?)', q)
    if spoon:
        n = float(spoon.group(1))
        if spoon.group(2):
            n = n / float(spoon.group(2))   # "1/2 tsp"
        return n * (15 if spoon.group(3).startswith('tb') else 5), True

    piece = re.search(r'([\d.]+)\s*(?:piece|pieces|peice|pcs|pc)\b', q)
    if piece:
        for pattern, grams_each in PIECE_GRAMS:
            if pattern.search(str(name or '').lower()):
                return float(piece.group(1)) * grams_each, True
        return 0.0, False

    return 0.0, False


def dedupe_size_variants(ingredients):
    """Drop a repeated ingredient block.

    Several drinks list their regular and large builds one after the other -
    Latte gives espresso, milk, foam and syrup twice, with more milk the second
    time. Read literally that is a drink with two of everything, which is how
    Cappuccino came out at 600 kcal. Where the opening run of ingredient names
    repeats immediately, only the first run is kept, so the figure describes the
    regular size.
    """
    names = [re.sub(r'\s+', ' ', str(n or '')).strip().lower() for n, _ in ingredients]
    for k in range(len(names) // 2, 1, -1):
        if names[:k] == names[k:2 * k]:
            return ingredients[:k]
    return ingredients


def estimate(recipe):
    """Approximate calories and sugar for one parsed recipe.

    Returns None when too much of the recipe could not be read - a figure built
    on half the ingredients would be worse than no figure.
    """
    if not recipe or not recipe.get('ingredients'):
        return None

    kcal = sugar = mass = 0.0
    known = unknown = 0

    for name, qty in dedupe_size_variants(recipe['ingredients']):
        if OPTIONAL.search(str(name or '')):
            known += 1
            continue
        per100 = lookup(name)
        grams, amount_known = amount(qty, name)

        if per100 is None or not amount_known:
            # An unreadable amount of a zero-calorie thing still tells us
            # nothing is missing.
            if per100 == (0, 0):
                known += 1
                continue
            unknown += 1
            continue

        known += 1
        mass += grams
        kcal += per100[0] * grams / 100.0
        sugar += per100[1] * grams / 100.0

    total = known + unknown
    if not total or known / total < 0.75:
        return None

    # Two sanity checks against recipes that are not one serving. Some rows are
    # batch quantities, and the parser occasionally runs two dishes together -
    # the Hazelnut Nutella bowl cake came out holding a whole second cake. Half
    # a kilo in the bowl, or more than 800 kcal, means the figure describes
    # something other than what reaches the table, so nothing is published.
    if mass > 500 or kcal > 800:
        return None
    return {
        'kcal': int(round(kcal / 5.0) * 5),          # 5 kcal is the honest precision
        'sugar': round(sugar * 2) / 2.0,             # nearest half gram
        'coverage': round(known / total, 2),
    }
