import { hasErrors } from './diagnostics';
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
export function normalize(recipe: Recipe, options: RecipeOptions = {}): Recipe {
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

  if (steps.length === 0 || hasErrors(validate(cleaned, options))) return cleaned;
  return { ...cleaned, ingredients: treeOrder(cleaned) };
}

/** Ingredients in depth-first order from the final step. Assumes a valid tree. */
export function treeOrder(recipe: Recipe): Ingredient[] {
  const ingredientByKey = new Map(recipe.ingredients.map((i) => [i.key, i]));
  const stepByKey = new Map(recipe.steps.map((s) => [s.key, s]));
  const ordered: Ingredient[] = [];
  const visit = (step: Step) => {
    for (const input of step.inputs) {
      const ingredient = ingredientByKey.get(input);
      if (ingredient) ordered.push(ingredient);
      else {
        const child = stepByKey.get(input);
        if (child) visit(child);
      }
    }
  };
  const root = recipe.steps[recipe.steps.length - 1];
  if (root) visit(root);
  return ordered;
}
