import { parseQuantity, QUANTITY_SOURCE } from '../quantity';

export interface ParsedIngredientLabel {
  name: string;
  quantity?: number;
  unit?: string;
  /** Original quantity text, kept for diagnostics. */
  quantityText?: string;
}

const LEADING_QUANTITY = new RegExp(String.raw`^(?:${QUANTITY_SOURCE})`);
const QUOTED_PREFIX = new RegExp(String.raw`^(${QUANTITY_SOURCE})(?:\s*(\S+))?$`);

/**
 * Splits an ingredient label into quantity, unit and name.
 *
 * Unquoted `[1,5 kg Pommes de terre]`:
 * - a leading quantity (`3`, `1.5`, `1,5`, `1/2`) is taken when followed by
 *   a blank, a letter or the end of the label (so `4-épices` stays a name);
 * - the next word is the unit if it is in `units` (case-insensitive, may be
 *   glued: `500g`) **and** a name follows it (`[500 g]` = 500 × "g");
 * - the rest, trimmed, is the name.
 *
 * Quoted `[1,5 kg "Pommes (vapeur"]` / `["4 épices"]`: the quoted string is
 * the name, verbatim; the prefix is the quantity and optional unit.
 *
 * Quantities may come out as 0 or Infinity; the caller reports them.
 *
 * @param units lower-case → canonical spelling.
 */
export function parseIngredientLabel(
  label: { value: string; quoted: boolean; prefix: string },
  units: ReadonlyMap<string, string>,
): ParsedIngredientLabel {
  if (label.quoted) {
    const name = label.value.trim();
    const match = QUOTED_PREFIX.exec(label.prefix.trim());
    if (!match) return { name };
    const result: ParsedIngredientLabel = {
      name,
      quantityText: match[1]!,
      quantity: parseQuantity(match[1]!),
    };
    if (match[2] !== undefined) result.unit = units.get(match[2].toLowerCase()) ?? match[2];
    return result;
  }

  const text = label.value.trim();
  const quantityMatch = LEADING_QUANTITY.exec(text);
  if (!quantityMatch) return { name: text };
  const quantityText = quantityMatch[0];
  let rest = text.slice(quantityText.length);
  if (rest !== '' && !/^[\s\p{L}]/u.test(rest)) return { name: text };

  const result: ParsedIngredientLabel = {
    name: '',
    quantityText,
    quantity: parseQuantity(quantityText),
  };
  rest = rest.trimStart();
  const unitMatch = /^(\S+)(\s+|$)/.exec(rest);
  if (unitMatch) {
    const unit = units.get(unitMatch[1]!.toLowerCase());
    const after = rest.slice(unitMatch[0].length).trim();
    if (unit !== undefined && after !== '') {
      result.unit = unit;
      rest = after;
    }
  }
  result.name = rest.trim();
  return result;
}
