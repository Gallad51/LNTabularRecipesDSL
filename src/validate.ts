import { diagnostic, type Diagnostic } from './diagnostics';
import { KEY_PATTERN, unitLookup, type Recipe, type RecipeOptions } from './model';

type Path = (string | number)[];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates a recipe given as JSON (e.g. received by an API). Returns every
 * problem found, each with a `path` into the input. An empty array (or only
 * warnings) means the recipe is valid.
 *
 * Accepts `unknown` so it can be used on untrusted input: shape problems are
 * reported as INVALID_SHAPE instead of throwing.
 */
export function validate(recipe: Recipe | unknown, options: RecipeOptions = {}): Diagnostic[] {
  const out: Diagnostic[] = [];
  const shape = (path: Path, expected: string) =>
    out.push(diagnostic('INVALID_SHAPE', { expected }, { path }));

  if (!isObject(recipe)) {
    shape([], 'an object with prerequisites, ingredients and steps');
    return out;
  }
  const { prerequisites, ingredients, steps } = recipe;
  if (!Array.isArray(prerequisites)) shape(['prerequisites'], 'an array of strings');
  if (!Array.isArray(ingredients)) shape(['ingredients'], 'an array');
  if (!Array.isArray(steps)) shape(['steps'], 'an array');
  if (!Array.isArray(prerequisites) || !Array.isArray(ingredients) || !Array.isArray(steps)) {
    return out;
  }

  prerequisites.forEach((text, i) => {
    if (typeof text !== 'string') shape(['prerequisites', i], 'a string');
    else if (text.trim() === '')
      out.push(diagnostic('EMPTY_TEXT', {}, { path: ['prerequisites', i] }));
  });

  // --- keys -------------------------------------------------------------------------------
  const kinds = new Map<string, { kind: 'ingredient' | 'step'; index: number }>();
  const checkKey = (key: unknown, path: Path, kind: 'ingredient' | 'step', index: number) => {
    if (typeof key !== 'string') {
      shape([...path, 'key'], 'a string');
      return;
    }
    if (!KEY_PATTERN.test(key)) {
      out.push(diagnostic('INVALID_KEY', { key }, { path: [...path, 'key'] }));
    }
    if (kinds.has(key)) {
      out.push(diagnostic('DUPLICATE_KEY', { key }, { path: [...path, 'key'] }));
    } else {
      kinds.set(key, { kind, index });
    }
  };

  // --- ingredients ------------------------------------------------------------------------
  const units = unitLookup(options.units);
  let shapeOk = true;
  ingredients.forEach((ingredient, i) => {
    const path: Path = ['ingredients', i];
    if (!isObject(ingredient)) {
      shape(path, 'an ingredient object');
      shapeOk = false;
      return;
    }
    checkKey(ingredient.key, path, 'ingredient', i);
    if (typeof ingredient.name !== 'string') shape([...path, 'name'], 'a string');
    else if (ingredient.name.trim() === '')
      out.push(diagnostic('EMPTY_TEXT', {}, { path: [...path, 'name'] }));

    const { quantity, unit } = ingredient;
    if (quantity !== undefined) {
      if (typeof quantity !== 'number') shape([...path, 'quantity'], 'a number');
      else if (!Number.isFinite(quantity) || quantity <= 0) {
        out.push(
          diagnostic(
            'INVALID_QUANTITY',
            { quantity: String(quantity) },
            { path: [...path, 'quantity'] },
          ),
        );
      }
    }
    if (unit !== undefined) {
      if (typeof unit !== 'string') shape([...path, 'unit'], 'a string');
      else if (unit.trim() !== '') {
        if (quantity === undefined) {
          out.push(diagnostic('UNIT_WITHOUT_QUANTITY', { unit }, { path: [...path, 'unit'] }));
        }
        if (!units.has(unit.trim().toLowerCase())) {
          out.push(diagnostic('UNKNOWN_UNIT', { unit }, { path: [...path, 'unit'] }, 'warning'));
        }
      }
    }
  });

  // --- steps ------------------------------------------------------------------------------
  steps.forEach((step, i) => {
    const path: Path = ['steps', i];
    if (!isObject(step)) {
      shape(path, 'a step object');
      shapeOk = false;
      return;
    }
    checkKey(step.key, path, 'step', i);
    if (typeof step.text !== 'string') shape([...path, 'text'], 'a string');
    else if (step.text.trim() === '')
      out.push(diagnostic('EMPTY_TEXT', {}, { path: [...path, 'text'] }));
    if (!Array.isArray(step.inputs) || step.inputs.some((input) => typeof input !== 'string')) {
      shape([...path, 'inputs'], 'an array of keys');
      shapeOk = false;
    }
  });

  if (!shapeOk || steps.length === 0) return out; // drafts: no tree rules

  // --- tree rules -------------------------------------------------------------------------
  const consumers = new Map<string, string>();
  steps.forEach((rawStep, i) => {
    const step = rawStep as { key: string; inputs: string[] };
    const path: Path = ['steps', i];
    if (step.inputs.length === 0) {
      out.push(diagnostic('NO_INPUT', { key: String(step.key) }, { path: [...path, 'inputs'] }));
    }
    step.inputs.forEach((input, j) => {
      const inputPath: Path = [...path, 'inputs', j];
      const target = kinds.get(input);
      if (!target) {
        out.push(diagnostic('UNKNOWN_REFERENCE', { key: input }, { path: inputPath }));
        return;
      }
      if (target.kind === 'step' && target.index >= i) {
        out.push(
          diagnostic(
            'FORWARD_REFERENCE',
            { key: input, step: String(step.key) },
            { path: inputPath },
          ),
        );
        return;
      }
      const consumer = consumers.get(input);
      if (consumer !== undefined) {
        out.push(diagnostic('MULTIPLE_CONSUMERS', { key: input, consumer }, { path: inputPath }));
        return;
      }
      consumers.set(input, String(step.key));
    });
  });

  ingredients.forEach((ingredient, i) => {
    const key = (ingredient as { key: unknown }).key;
    if (typeof key === 'string' && !consumers.has(key)) {
      out.push(diagnostic('UNCONSUMED', { key }, { path: ['ingredients', i] }));
    }
  });

  const root = String((steps[steps.length - 1] as { key: unknown }).key);
  steps.slice(0, -1).forEach((step, i) => {
    const key = (step as { key: unknown }).key;
    if (typeof key === 'string' && !consumers.has(key)) {
      out.push(diagnostic('MULTIPLE_ROOTS', { key, root }, { path: ['steps', i] }));
    }
  });

  return out;
}
