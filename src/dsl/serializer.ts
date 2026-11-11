import type { Diagnostic } from '../diagnostics';
import { unitLookup, type Ingredient, type Recipe, type RecipeOptions, type Step } from '../model';
import { normalize } from '../normalize';
import { formatExactQuantity } from '../quantity';
import { parseIngredientLabel } from './label';
import { lexLine } from './lexer';

export type SerializeOptions = RecipeOptions;

/**
 * Writes a recipe in canonical DSL form:
 *
 * 1. `before: …` lines, then a blank line if anything follows;
 * 2. drafts (no steps): one ingredient definition per line;
 * 3. otherwise one line per step, in step order: `inputs --> key(text)`,
 *    each ingredient defined inline at its use, earlier steps as bare ids.
 *    A step whose single input is the step just before it is appended to
 *    that line as a chain: `… --> a(x) --> b(y)`.
 *
 * Labels are quoted only when needed (the serializer checks that each label
 * reads back identically). Quantities are written losslessly with
 * `decimalSeparator` (default `.`). The recipe is normalized first, so
 * `parse(serialize(r)).recipe` deep-equals `normalize(r)` for every valid r.
 *
 * Invalid recipes are still written, best effort (unused ingredients become
 * standalone definitions at the end), so an editor can switch to text mode
 * and let the parser point at the problems.
 */
export function serialize(recipe: Recipe, options: SerializeOptions = {}): string {
  const r = normalize(recipe, options);
  const separator = options.decimalSeparator ?? '.';
  const unitSet = new Set(unitLookup(options.units).keys());
  const unitMap = unitLookup(options.units);
  const lines: string[] = r.prerequisites.map((text) => `before: ${prerequisiteText(text)}`);
  const body: string[] = [];

  const ingredientByKey = new Map(r.ingredients.map((i) => [i.key, i]));
  const defined = new Set<string>();
  const ingredientRef = (ingredient: Ingredient) => {
    if (defined.has(ingredient.key)) return ingredient.key;
    defined.add(ingredient.key);
    return `${ingredient.key}[${ingredientLabel(ingredient, separator, unitSet, unitMap)}]`;
  };
  const stepRef = (step: Step) => `${step.key}(${stepLabel(step.text, unitSet)})`;
  const inputRef = (key: string) => {
    const ingredient = ingredientByKey.get(key);
    return ingredient ? ingredientRef(ingredient) : key;
  };

  for (let i = 0; i < r.steps.length; i++) {
    let step = r.steps[i]!;
    let line =
      step.inputs.length > 0
        ? `${step.inputs.map(inputRef).join(' & ')} --> ${stepRef(step)}`
        : stepRef(step);
    let next = r.steps[i + 1];
    while (next && next.inputs.length === 1 && next.inputs[0] === step.key) {
      line += ` --> ${stepRef(next)}`;
      step = next;
      i++;
      next = r.steps[i + 1];
    }
    body.push(line);
  }
  for (const ingredient of r.ingredients) {
    if (!defined.has(ingredient.key)) body.push(ingredientRef(ingredient));
  }

  if (lines.length > 0 && body.length > 0) lines.push('');
  lines.push(...body);
  return lines.length > 0 ? `${lines.join('\n')}\n` : '';
}

function quote(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function prerequisiteText(text: string): string {
  const diagnostics: Diagnostic[] = [];
  const lexed = lexLine(`before: ${text}`, 1, new Set(), diagnostics);
  const token = lexed.tokens[0];
  const readsBack = diagnostics.length === 0 && token?.type === 'before' && token.text === text;
  return readsBack && text !== '' ? text : quote(text);
}

/** Lexes `x<open>content<close>` and returns the label token if it reads back cleanly. */
function relex(content: string, shape: 'square' | 'round', units: ReadonlySet<string>) {
  const [open, close] = shape === 'square' ? ['[', ']'] : ['(', ')'];
  const source = `x${open}${content}${close}`;
  const diagnostics: Diagnostic[] = [];
  const lexed = lexLine(source, 1, units, diagnostics);
  const label = lexed.tokens[1];
  if (diagnostics.length > 0 || lexed.tokens.length !== 2 || label?.type !== 'label')
    return undefined;
  return label.endColumn === source.length + 1 ? label : undefined;
}

function stepLabel(text: string, units: ReadonlySet<string>): string {
  const label = relex(text, 'round', units);
  return label && !label.quoted && label.value.trim() === text && text !== '' ? text : quote(text);
}

function ingredientLabel(
  ingredient: Ingredient,
  separator: '.' | ',',
  units: ReadonlySet<string>,
  unitMap: ReadonlyMap<string, string>,
): string {
  const prefix =
    ingredient.quantity === undefined
      ? ''
      : [formatExactQuantity(ingredient.quantity, separator), ingredient.unit]
          .filter((part) => part !== undefined)
          .join(' ');
  const raw = [prefix, ingredient.name].filter((part) => part !== '').join(' ');
  const label = relex(raw, 'square', units);
  if (label && !label.quoted) {
    const parsed = parseIngredientLabel(label, unitMap);
    if (
      parsed.name === ingredient.name &&
      parsed.quantity === ingredient.quantity &&
      parsed.unit === ingredient.unit &&
      ingredient.name !== ''
    ) {
      return raw;
    }
  }
  return prefix === '' ? quote(ingredient.name) : `${prefix} ${quote(ingredient.name)}`;
}
