import type { Recipe } from './model';
import { layout, type Cell, type LayoutOptions } from './layout';

export interface RenderHtmlOptions extends LayoutOptions {
  /** CSS class prefix (default `trd`). Must match the stylesheet you use. */
  classPrefix?: string;
  /** Keep the quantity and ingredient columns visible while scrolling horizontally. */
  stickyIngredients?: boolean;
  /** Optional `<caption>` text (e.g. the recipe name). */
  caption?: string;
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes text for HTML element content and attribute values. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ESCAPES[ch]!);
}

/**
 * Renders a recipe as a standalone HTML table (string), framework-free.
 * All text is escaped. Pair it with `ln-tabular-recipes-dsl/style.css`, or
 * style the classes yourself:
 *
 * `{p}-wrap` (scroll container), `{p}-table` (+ `{p}-sticky`, `{p}-invalid`),
 * `{p}-banner`, `{p}-qty`, `{p}-ingredient`, `{p}-step` (+ `{p}-final`).
 * Cells carry `data-key` with the ingredient/step key.
 */
export function renderHtml(recipe: Recipe, options: RenderHtmlOptions = {}): string {
  const p = options.classPrefix ?? 'trd';
  const grid = layout(recipe, options);
  const tableClasses = [`${p}-table`];
  if (options.stickyIngredients) tableClasses.push(`${p}-sticky`);
  if (!grid.valid) tableClasses.push(`${p}-invalid`);

  const cellHtml = (cell: Cell) => {
    const classes = [`${p}-${cell.kind === 'quantity' ? 'qty' : cell.kind}`];
    if (cell.final) classes.push(`${p}-final`);
    const attrs = [`class="${classes.join(' ')}"`, `data-key="${escapeHtml(cell.key)}"`];
    if (cell.rowSpan > 1) attrs.push(`rowspan="${cell.rowSpan}"`);
    if (cell.colSpan > 1) attrs.push(`colspan="${cell.colSpan}"`);
    return `<td ${attrs.join(' ')}>${escapeHtml(cell.text)}</td>`;
  };

  const parts: string[] = [`<div class="${p}-wrap">`, `<table class="${tableClasses.join(' ')}">`];
  if (options.caption !== undefined)
    parts.push(`<caption>${escapeHtml(options.caption)}</caption>`);
  parts.push('<tbody>');
  for (const banner of grid.banners) {
    parts.push(
      `<tr class="${p}-banner-row"><td class="${p}-banner" colspan="${grid.columnCount}">${escapeHtml(banner)}</td></tr>`,
    );
  }
  for (const cells of grid.rows) parts.push(`<tr>${cells.map(cellHtml).join('')}</tr>`);
  parts.push('</tbody>', '</table>', '</div>');
  return parts.join('\n');
}
