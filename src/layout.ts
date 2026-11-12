import { hasErrors } from './diagnostics';
import type { Recipe, RecipeOptions, Step } from './model';
import { isForest, normalize } from './normalize';
import { formatQuantity } from './quantity';
import { validate } from './validate';

export type CellKind = 'quantity' | 'ingredient' | 'step';

export interface Cell {
  kind: CellKind;
  /** Ingredient key (quantity / ingredient cells) or step key. */
  key: string;
  text: string;
  /** 0-based grid position of the top-left corner. */
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  /** True for the final step (rightmost column). */
  final?: boolean;
  /**
   * Partial layout only: true for the cells of a node no step consumes yet
   * (unconsumed ingredients — both their quantity and name cells — and root
   * steps of an unfinished recipe). These are what an editor lets the user
   * combine. Never set on a complete tree.
   */
  open?: boolean;
}

export interface Layout {
  /** False when the recipe is not a valid tree: only ingredients are laid out (draft layout). */
  valid: boolean;
  /** 2 (quantity + ingredient) + depth of the final step. */
  columnCount: number;
  /** Prerequisites, rendered as full-width rows above the table. */
  banners: string[];
  /** `rows[r]` = cells that *start* on row r, left to right (HTML table semantics). */
  rows: Cell[][];
}

export interface LayoutOptions extends RecipeOptions {
  /** Max decimals of displayed quantities (default 2). */
  maxDecimals?: number;
  /** Display names for units, e.g. `{ pincee: 'pincée', cs: 'c. à s.' }`. Unlisted units show as-is. */
  unitLabels?: Readonly<Record<string, string>>;
  /**
   * Lay out a recipe under construction (a forest: several root steps and/or
   * unconsumed ingredients) instead of falling back to the 2-column draft
   * layout. Each subtree gets contiguous rows, open nodes stretch to the last
   * column and carry `open: true`. Complete trees are laid out exactly as
   * without the option. Default `false`.
   */
  partial?: boolean;
}

/**
 * Computes the tabular grid of a recipe.
 *
 * - Column 0 = quantity, column 1 = ingredient, columns 2… = steps by depth:
 *   depth(ingredient) = 0, depth(step) = 1 + max depth of its inputs,
 *   step column = 1 + depth. The final step is alone in the last column.
 * - One row per ingredient (normalized depth-first order). A step spans the
 *   rows of all the ingredients under it.
 * - No empty cells: a step or ingredient whose consumer sits more than one
 *   column to the right stretches (`colSpan`) up to that consumer.
 *
 * Drafts (and invalid recipes, with `valid: false`) get a 2-column layout,
 * unless `partial` is set and the recipe is a well-formed forest: then every
 * subtree is laid out and open nodes are flagged (still `valid: false`).
 */
export function layout(recipe: Recipe, options: LayoutOptions = {}): Layout {
  const r = normalize(recipe, options);
  const diagnostics = validate(r, options);
  const valid = !hasErrors(diagnostics);
  const partial = !valid && options.partial === true && isForest(diagnostics);
  const quantityText = (quantity?: number, unit?: string) =>
    quantity === undefined
      ? ''
      : [
          formatQuantity(quantity, {
            decimalSeparator: options.decimalSeparator,
            maxDecimals: options.maxDecimals,
          }),
          unit === undefined ? undefined : (options.unitLabels?.[unit] ?? unit),
        ]
          .filter(Boolean)
          .join(' ');

  const useTree = (valid || partial) && r.steps.length > 0;
  // Drafts in partial mode: every ingredient is open.
  const flagOpen = partial || (options.partial === true && valid && r.steps.length === 0);
  const stepByKey = new Map(r.steps.map((s) => [s.key, s]));
  const depth = new Map<string, number>();
  const consumer = new Map<string, Step>();
  const leaves = new Map<string, string[]>(); // step key → ingredient keys under it, in row order
  if (useTree) {
    for (const step of r.steps) {
      // Steps are ordered so that inputs come first: one pass is enough.
      let d = 0;
      const under: string[] = [];
      for (const input of step.inputs) {
        consumer.set(input, step);
        const child = stepByKey.get(input);
        d = Math.max(d, child ? depth.get(input)! : 0);
        under.push(...(child ? leaves.get(input)! : [input]));
      }
      depth.set(step.key, d + 1);
      leaves.set(step.key, under);
    }
  }

  // Complete tree: the root is the last step. Forest: deepest root.
  let maxDepth = 0;
  for (const step of r.steps) {
    if (useTree && !consumer.has(step.key)) maxDepth = Math.max(maxDepth, depth.get(step.key)!);
  }
  const columnCount = 2 + maxDepth;
  const columnOf = (stepKey: string) => 1 + depth.get(stepKey)!;
  const rowOf = new Map(r.ingredients.map((ingredient, i) => [ingredient.key, i]));

  const rows: Cell[][] = r.ingredients.map((ingredient, row) => {
    const parent = consumer.get(ingredient.key);
    const open = flagOpen && !parent;
    return [
      {
        kind: 'quantity',
        key: ingredient.key,
        text: quantityText(ingredient.quantity, ingredient.unit),
        row,
        col: 0,
        rowSpan: 1,
        colSpan: 1,
        ...(open ? { open } : {}),
      },
      {
        kind: 'ingredient',
        key: ingredient.key,
        text: ingredient.name,
        row,
        col: 1,
        rowSpan: 1,
        colSpan: parent ? columnOf(parent.key) - 1 : open ? columnCount - 1 : 1,
        ...(open ? { open } : {}),
      },
    ];
  });

  if (useTree) {
    for (const step of r.steps) {
      const under = leaves.get(step.key)!;
      const row = rowOf.get(under[0]!)!;
      const col = columnOf(step.key);
      const parent = consumer.get(step.key);
      rows[row]!.push({
        kind: 'step',
        key: step.key,
        text: step.text,
        row,
        col,
        rowSpan: under.length,
        colSpan: parent ? columnOf(parent.key) - col : partial ? columnCount - col : 1,
        ...(parent ? {} : partial ? { open: true } : { final: true }),
      });
    }
    for (const cells of rows) cells.sort((a, b) => a.col - b.col);
  }

  return { valid, columnCount, banners: [...r.prerequisites], rows };
}
