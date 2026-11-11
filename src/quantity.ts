import type { DecimalSeparator, Recipe } from './model';

export interface FormatQuantityOptions {
  decimalSeparator?: DecimalSeparator;
  /** Maximum number of decimals (default 2). Trailing zeros are removed. */
  maxDecimals?: number;
}

/**
 * Formats a quantity for display: rounded to `maxDecimals` (default 2),
 * trailing zeros removed. Positive values that would round to 0 keep two
 * significant digits instead (e.g. 0.004 → "0.004"), so a non-zero amount is
 * never shown as "0".
 */
export function formatQuantity(value: number, options: FormatQuantityOptions = {}): string {
  const { decimalSeparator = '.', maxDecimals = 2 } = options;
  if (!Number.isFinite(value)) return String(value);
  let text: string;
  const rounded = Number(value.toFixed(maxDecimals));
  if (rounded === 0 && value !== 0) {
    text = trimZeros(Math.abs(value) < 1e-6 ? value.toExponential(1) : value.toPrecision(2));
  } else {
    text = trimZeros(rounded.toFixed(maxDecimals));
  }
  return decimalSeparator === ',' ? text.replace('.', ',') : text;
}

/**
 * Formats a quantity losslessly (used by the serializer): no rounding, never
 * exponent notation for usual cooking magnitudes.
 */
export function formatExactQuantity(
  value: number,
  decimalSeparator: DecimalSeparator = '.',
): string {
  let text = String(value);
  if (/e/i.test(text)) {
    // 1e-7 / 1e21 style: expand. Precision beyond 20 decimals is not representable in the DSL.
    text = trimZeros(value.toFixed(20));
  }
  return decimalSeparator === ',' ? text.replace('.', ',') : text;
}

function trimZeros(text: string): string {
  if (!text.includes('.') || /e/i.test(text)) return text;
  return text.replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * Parses a DSL quantity: integer, decimal with `.` or `,`, or simple fraction `a/b`.
 * Returns `undefined` when the text is not a quantity. May return 0 or Infinity
 * (e.g. "0", "1/0"); callers report those as INVALID_QUANTITY.
 */
export function parseQuantity(text: string): number | undefined {
  const fraction = /^(\d+)\/(\d+)$/.exec(text);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  if (/^\d+(?:[.,]\d+)?$/.test(text)) return Number(text.replace(',', '.'));
  return undefined;
}

/** Regex source of a DSL quantity, shared by the lexer and the label parser. */
export const QUANTITY_SOURCE = String.raw`\d+\/\d+|\d+(?:[.,]\d+)?`;

/**
 * Multiplies every ingredient quantity by `factor` (e.g. 6/4 to go from 4 to
 * 6 servings). Quantities are not rounded; use {@link formatQuantity} to display.
 * Throws a RangeError if `factor` is not a finite number > 0.
 */
export function scale(recipe: Recipe, factor: number): Recipe {
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new RangeError(`scale factor must be a finite number > 0, got ${factor}`);
  }
  return {
    prerequisites: [...recipe.prerequisites],
    ingredients: recipe.ingredients.map((ingredient) =>
      ingredient.quantity === undefined
        ? { ...ingredient }
        : { ...ingredient, quantity: ingredient.quantity * factor },
    ),
    steps: recipe.steps.map((step) => ({ ...step, inputs: [...step.inputs] })),
  };
}
