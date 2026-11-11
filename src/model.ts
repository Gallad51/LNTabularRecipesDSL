/**
 * Core data model of a tabular recipe.
 *
 * A recipe is a tree: ingredients are leaves, steps are nodes and the last
 * step is the root ("final step"). `prerequisites` are steps that use no
 * ingredient (e.g. "Preheat the oven"); they are rendered as full-width
 * banners above the table.
 */
export interface Recipe {
  prerequisites: string[];
  ingredients: Ingredient[];
  steps: Step[];
}

export interface Ingredient {
  /** Node id, unique across ingredients and steps. See {@link KEY_PATTERN}. */
  key: string;
  name: string;
  /** Finite, strictly positive. */
  quantity?: number;
  /** Only meaningful together with `quantity`. */
  unit?: string;
}

export interface Step {
  /** Node id, unique across ingredients and steps. See {@link KEY_PATTERN}. */
  key: string;
  text: string;
  /** Keys of the ingredients and/or earlier steps this step combines, in row order. */
  inputs: string[];
}

/** Allowed node keys: 1 to 40 ASCII letters, digits, `_` or `-`. */
export const KEY_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

export const MAX_KEY_LENGTH = 40;

/** Default unit vocabulary. Matching is case-insensitive; the spelling below is canonical. */
export const DEFAULT_UNITS: readonly string[] = [
  'pcs',
  'g',
  'kg',
  'ml',
  'cl',
  'l',
  'cs',
  'cc',
  'pincee',
];

export type DecimalSeparator = '.' | ',';

/** Options shared by most functions of the library. */
export interface RecipeOptions {
  /** Unit vocabulary (case-insensitive, canonical spelling taken from this list). */
  units?: readonly string[];
  /** Decimal separator used when *writing* quantities. Parsing always accepts both. Default `.`. */
  decimalSeparator?: DecimalSeparator;
}

/** Builds a lower-case → canonical spelling lookup for a unit list. */
export function unitLookup(units: readonly string[] = DEFAULT_UNITS): Map<string, string> {
  const map = new Map<string, string>();
  for (const unit of units) {
    const lower = unit.toLowerCase();
    if (!map.has(lower)) map.set(lower, unit);
  }
  return map;
}
