/**
 * Menu recommendation scoring.
 *
 * The POS export carries no tags — an item is a name, a description, a price
 * and a category — so the traits are derived here from the category plus
 * keywords in the name and description. That keeps the menu the single source
 * of truth: new items are tagged automatically on the next export, with no
 * parallel list to maintain. The trade-off is that a badly named item gets
 * badly tagged, which is why the reasons are shown to the customer rather than
 * the score.
 */

const KIND_BY_CATEGORY = {
  'hot-bevarages': 'coffee',
  'iced-bevarages': 'coffee',
  'cold-brews': 'coffee',
  'soul-specials-bevarages': 'coffee',
  frappes: 'coffee',
  matcha: 'tea',
  tea: 'tea',
  'ice-tea': 'tea',
  toast: 'food',
  'soul-special-fusion-food': 'food',
  bagels: 'food',
  'croissant-sandwiches': 'food',
  'sourdough-sandwiches': 'food',
  wraps: 'food',
  burgers: 'food',
  'pizza-flat-breads': 'food',
  'fries-and-pockets': 'food',
  dips: 'food',
  'protein-series': 'food',
  desserts: 'sweet',
  cookies: 'sweet',
  muffins: 'sweet',
  croissants: 'sweet',
  puffs: 'food',
  'soul-cake-bowl-cake': 'sweet',
};

const COLD_CATEGORIES = new Set([
  'iced-bevarages',
  'cold-brews',
  'ice-tea',
  'frappes',
  'summer-specials',
]);

const HOT_CATEGORIES = new Set(['hot-bevarages', 'tea', 'toast']);

const FLAVOUR_PATTERNS = {
  chocolate: /chocolate|choco|mocha|nutella|cocoa|truffle|brownie|biscoff/,
  fruity:
    /mango|strawberry|blueberry|watermelon|litchi|orange|peach|pineapple|apple|banana|lemon|citrus|aamras|coconut|berry/,
  nutty: /hazelnut|almond|pistachio|walnut|peanut|nutella|(?<![a-z])nuts?(?![a-z])/,
  caramel: /caramel|butterscotch|toffee|vanilla|tiramisu|bombon/,
  // "cheese" must not match "cheesecake", and "masala" belongs to spiced only.
  savoury:
    /cheese(?!cake)|paneer|mushroom|garlic|pesto|hummus|falafel|tikka|chilli|thecha|samosa|vada|burger|pizza|wrap(?!ped)|fries|toast(?!ed)|bagel|sandwich|quesadilla|maggi/,
  spiced: /masala|ginger|cinnamon|nutmeg|turmeric|kadak|chai|qahva|spice/,
};

const NO_CAFFEINE = ['hot chocolate', 'chocolate', 'aamras', 'juice', 'soda', 'milk', 'cascara'];

const haystack = (item) => `${item.name} ${item.description || ''}`.toLowerCase();

/** Traits for one item, derived from its category and wording. */
export function traitsFor(item, categoryId) {
  const text = haystack(item);
  let kind = KIND_BY_CATEGORY[categoryId];
  if (!kind) {
    // Seasonal and combo categories mix everything, so read the item itself.
    if (/matcha|chai|(?<![a-z])tea(?![a-z])/.test(text)) kind = 'tea';
    else if (/coffee|latte|mocha|espresso|americano|cappuccino|brew|frappe|cold coffee/.test(text)) {
      kind = 'coffee';
    } else if (/cake|cheesecake|cookie|muffin|brownie|croissant|dessert|pie|tiramisu/.test(text)) {
      kind = 'sweet';
    } else if (/toast|bun|pizza|burger|wrap|bagel|sandwich|fries|taco|maggi|quesadilla|puff/.test(text)) {
      kind = 'food';
    } else kind = 'other';
  }

  const flavours = Object.entries(FLAVOUR_PATTERNS)
    .filter(([, pattern]) => pattern.test(text))
    .map(([flavour]) => flavour);

  let temp = null;
  if (COLD_CATEGORIES.has(categoryId) || /\b(iced|cold|frappe|chilled|sparkling)\b/.test(text)) {
    temp = 'cold';
  } else if (HOT_CATEGORIES.has(categoryId) || /\b(hot|warm)\b/.test(text)) {
    temp = 'hot';
  }

  const caffeineFree = NO_CAFFEINE.some((w) => text.includes(w)) && kind !== 'coffee';

  return { kind, temp, flavours, caffeineFree, categoryId };
}

/**
 * Score every item against the customer's answers.
 *
 * @param {Array} categories menu categories
 * @param {{kinds: string[], temp: string, flavours: string[], budget: number|null}} prefs
 * @returns {{results: Array, relaxed: string[]}}
 */
export function recommend(categories, prefs, { limit = 6, hasPhoto = () => false } = {}) {
  const pool = [];
  for (const category of categories) {
    for (const item of category.items) {
      if (item.available === false) continue;
      pool.push({ item, category, traits: traitsFor(item, category.id) });
    }
  }

  const relaxed = [];

  const score = (entry, { useBudget, useFlavour }) => {
    const { item, traits } = entry;
    let points = 0;
    const reasons = [];

    if (prefs.kinds.length) {
      if (!prefs.kinds.includes(traits.kind)) return null; // a hard filter, not a nudge
      points += 5;
    }

    if (prefs.temp && prefs.temp !== 'either') {
      if (traits.temp && traits.temp !== prefs.temp) return null;
      if (traits.temp === prefs.temp) {
        points += 3;
        reasons.push(prefs.temp === 'cold' ? 'served cold' : 'served hot');
      }
    }

    if (useFlavour && prefs.flavours.length) {
      const hits = traits.flavours.filter((f) => prefs.flavours.includes(f));
      if (hits.length) {
        points += 3 * hits.length;
        reasons.push(hits.join(' + '));
      }
    }

    if (useBudget && prefs.budget) {
      if (item.price > prefs.budget) return null;
      points += 2;
    }

    // A photo makes a suggestion far easier to say yes to.
    if (hasPhoto(item)) {
      points += 1;
      reasons.push('has a photo');
    }

    // Nudge towards the café's own signatures over commodity items.
    if (['soul-specials-bevarages', 'soul-special-fusion-food'].includes(traits.categoryId)) {
      points += 2;
      reasons.push('a Soul signature');
    }

    return { ...entry, points, reasons };
  };

  // Try strictest first, then loosen — an empty result is a worse answer than
  // a slightly-off one, as long as we say what we relaxed.
  const passes = [
    { useBudget: true, useFlavour: true, note: null },
    { useBudget: true, useFlavour: false, note: 'ignoring flavour' },
    { useBudget: false, useFlavour: true, note: 'over your budget' },
    { useBudget: false, useFlavour: false, note: 'ignoring flavour and budget' },
  ];

  for (const pass of passes) {
    const scored = pool
      .map((e) => score(e, pass))
      .filter(Boolean)
      .sort((a, b) => b.points - a.points || a.item.price - b.item.price);

    if (scored.length) {
      if (pass.note) relaxed.push(pass.note);
      // One per category keeps the list varied instead of six cold brews.
      const seenCategory = new Map();
      const spread = [];
      for (const entry of scored) {
        const n = seenCategory.get(entry.category.id) || 0;
        if (n >= 2) continue;
        seenCategory.set(entry.category.id, n + 1);
        spread.push(entry);
        if (spread.length >= limit) break;
      }
      return { results: spread, relaxed };
    }
  }

  return { results: [], relaxed };
}

export const QUESTIONS = [
  {
    id: 'kinds',
    label: 'What are you in the mood for?',
    multi: true,
    options: [
      { value: 'coffee', label: 'Coffee', emoji: '☕' },
      { value: 'tea', label: 'Tea & matcha', emoji: '🍵' },
      { value: 'food', label: 'Proper food', emoji: '🥪' },
      { value: 'sweet', label: 'Something sweet', emoji: '🍰' },
    ],
  },
  {
    id: 'temp',
    label: 'Hot or cold?',
    multi: false,
    options: [
      { value: 'hot', label: 'Hot', emoji: '🔥' },
      { value: 'cold', label: 'Cold', emoji: '🧊' },
      { value: 'either', label: 'Either', emoji: '🤷' },
    ],
  },
  {
    id: 'flavours',
    label: 'Flavours you lean towards',
    multi: true,
    options: [
      { value: 'chocolate', label: 'Chocolate', emoji: '🍫' },
      { value: 'fruity', label: 'Fruity', emoji: '🥭' },
      { value: 'nutty', label: 'Nutty', emoji: '🌰' },
      { value: 'caramel', label: 'Caramel & vanilla', emoji: '🍮' },
      { value: 'spiced', label: 'Spiced', emoji: '🫚' },
      { value: 'savoury', label: 'Savoury', emoji: '🧀' },
    ],
  },
  {
    id: 'budget',
    label: 'Keeping it under?',
    multi: false,
    options: [
      { value: 300, label: '₹300', emoji: '🪙' },
      { value: null, label: 'No limit', emoji: '✨' },
    ],
  },
];
