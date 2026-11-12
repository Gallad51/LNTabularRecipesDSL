import { hasErrors, type Diagnostic, type DiagnosticCode } from './diagnostics';
import { unitLookup, type Ingredient, type Recipe, type RecipeOptions, type Step } from './model';
import { validate } from './validate';

/**
 * Returns a cleaned copy of a recipe. Never throws (on well-shaped input):
 *
 * - trims prerequisites, keys, names, step texts and units;
 * - drops empty units and canonicalises known ones (`KG` → `kg`);
 * - omits `quantity`/`unit` properties that are undefined (stable deep equality);
 * - when the recipe is a valid tree, reorders ingredients by depth-first
 *   traversal from the final step (inputs in their given order), which makes
 *   the ingredients of every step contiguous rows.
 *
 * Steps keep their given order. Drafts (no steps) and invalid recipes keep the
 * given ingredient order — call {@link validate} to know why a recipe is invalid.
 */
export interface NormalizeOptions extends RecipeOptions {
  /**
   * Also order the rows of a **forest** (a recipe under construction: several
   * roots and/or unconsumed ingredients, but otherwise well formed): see
   * {@link forestOrder}. Default `false`.
   */
  partial?: boolean;
}

/**
 * Diagnostic codes that only say "the tree is not finished yet". A recipe whose
 * errors are all in this list is a well-formed **forest** that can be laid out
 * in partial mode.
 */
export const INCOMPLETE_TREE_CODES: readonly DiagnosticCode[] = ['UNCONSUMED', 'MULTIPLE_ROOTS'];

/**
 * Diagnostic codes that don't affect the structure of the tree (texts,
 * quantities, units, key spelling). They make a recipe invalid but don't
 * prevent a partial layout.
 */
const NON_STRUCTURAL_CODES: readonly DiagnosticCode[] = [
  'EMPTY_TEXT',
  'INVALID_QUANTITY',
  'UNIT_WITHOUT_QUANTITY',
  'UNKNOWN_UNIT',
  'INVALID_KEY',
];

/**
 * True when the diagnostics of a recipe with steps only report an unfinished
 * tree (and non-structural problems): ingredients and steps form a forest whose
 * subtrees can be laid out.
 */
export function isForest(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.every(
    (d) =>
      d.severity !== 'error' ||
      INCOMPLETE_TREE_CODES.includes(d.code) ||
      NON_STRUCTURAL_CODES.includes(d.code),
  );
}

export function normalize(recipe: Recipe, options: NormalizeOptions = {}): Recipe {
  const units = unitLookup(options.units);
  const prerequisites = recipe.prerequisites.map((text) => text.trim());
  const ingredients: Ingredient[] = recipe.ingredients.map((ingredient) => {
    const clean: Ingredient = { key: ingredient.key.trim(), name: ingredient.name.trim() };
    if (ingredient.quantity !== undefined) clean.quantity = ingredient.quantity;
    const unit = ingredient.unit?.trim();
    if (unit) clean.unit = units.get(unit.toLowerCase()) ?? unit;
    return clean;
  });
  const steps: Step[] = recipe.steps.map((step) => ({
    key: step.key.trim(),
    text: step.text.trim(),
    inputs: step.inputs.map((input) => input.trim()),
  }));
  const cleaned: Recipe = { prerequisites, ingredients, steps };

  if (steps.length === 0) return cleaned;
  const diagnostics = validate(cleaned, options);
  if (!hasErrors(diagnostics)) return { ...cleaned, ingredients: treeOrder(cleaned) };
  if (options.partial && isForest(diagnostics)) {
    return { ...cleaned, ingredients: forestOrder(cleaned) };
  }
  return cleaned;
}

/** Ingredients in depth-first order from the final step. Assumes a valid tree. */
export function treeOrder(recipe: Recipe): Ingredient[] {
  const root = recipe.steps[recipe.steps.length - 1];
  return root ? leavesOf(recipe, root) : [];
}

/** Ingredients under a step, depth-first, inputs in their given order. */
function leavesOf(recipe: Recipe, step: Step): Ingredient[] {
  const ingredientByKey = new Map(recipe.ingredients.map((i) => [i.key, i]));
  const stepByKey = new Map(recipe.steps.map((s) => [s.key, s]));
  const ordered: Ingredient[] = [];
  const visit = (current: Step) => {
    for (const input of current.inputs) {
      const ingredient = ingredientByKey.get(input);
      if (ingredient) ordered.push(ingredient);
      else {
        const child = stepByKey.get(input);
        if (child) visit(child);
      }
    }
  };
  visit(step);
  return ordered;
}

/**
 * Row order of a forest (recipe under construction). Every root step (a step
 * no other step consumes) forms a group with the ingredients under it, in
 * depth-first order; every unconsumed ingredient is a group of its own. Groups
 * are ordered by the position of their first ingredient in the given order,
 * so combining cells keeps the table stable: the combined rows move up to the
 * first of them. On a valid tree this is {@link treeOrder}. Assumes a forest
 * (see {@link isForest}).
 */
export function forestOrder(recipe: Recipe): Ingredient[] {
  const consumed = new Set(recipe.steps.flatMap((s) => s.inputs));
  const position = new Map(recipe.ingredients.map((ingredient, i) => [ingredient.key, i]));
  const groups: Ingredient[][] = [];
  for (const step of recipe.steps) {
    if (!consumed.has(step.key)) groups.push(leavesOf(recipe, step));
  }
  for (const ingredient of recipe.ingredients) {
    if (!consumed.has(ingredient.key)) groups.push([ingredient]);
  }
  const first = (group: Ingredient[]) =>
    Math.min(...group.map((i) => position.get(i.key) ?? Infinity));
  return groups
    .filter((group) => group.length > 0)
    .sort((a, b) => first(a) - first(b))
    .flat();
}
