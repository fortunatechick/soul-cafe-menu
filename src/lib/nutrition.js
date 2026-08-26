import itemTraits from '@/data/item-traits.json';

/**
 * Approximate calories and sugar, worked out from the kitchen's own recipe.
 *
 * scripts/nutrition.py adds up the ingredient quantities against a table of
 * standard reference values. That makes these estimates, not a lab analysis:
 * the table describes generic ingredients rather than the specific brands the
 * cafe buys, and a recipe records what goes into a drink rather than what ends
 * up in the cup. The script withholds a figure entirely where it could not read
 * enough of the recipe, or where the total looks like a batch rather than one
 * serving, so an item showing nothing is an item we cannot yet stand behind.
 *
 * Every figure is therefore labelled as an approximation wherever it is shown.
 */
export function nutritionFor(itemId) {
  const t = itemTraits[itemId];
  if (!t || typeof t.kcal !== 'number') return null;
  return { kcal: t.kcal, sugar: t.sugar };
}

/** "Under 5 kcal" reads better than "0 kcal" on a cup of green tea. */
export const formatKcal = (kcal) => (kcal < 5 ? 'Under 5 kcal' : `${kcal} kcal`);

export const formatSugar = (sugar) =>
  sugar < 0.5 ? 'No added sugar' : `${sugar} g sugar`;
