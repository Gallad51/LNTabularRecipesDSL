import type { Recipe } from './model';
import { layout, type Cell, type LayoutOptions } from './layout';

export interface RenderHtmlOptions extends LayoutOptions {
  /** CSS class prefix (default `trd`). Must match the stylesheet you use. */
  classPrefix?: string;
  /** Keep the quantity and ingredient columns visible while scrolling horizontally. */
  stickyIngredients?: boolean;
  /** Optional `<caption>` text (e.g. the recipe name). */
  caption?: string;
  /**
   * Orientation of the step texts (default `'horizontal'`).
   * - `'vertical'`: step texts read bottom to top, so step columns stay narrow (mobile-friendly).
   * - `'auto'`: vertical only when the wrapper is narrower than 40rem (CSS container query);
   *   the wrapper must then take its width from its parent, not from its content.
   */
  stepOrientation?: 'horizontal' | 'vertical' | 'auto';
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
 * `{p}-wrap` (scroll container, + `{p}-auto`), `{p}-table` (+ `{p}-sticky`,
 * `{p}-invalid`, `{p}-vsteps`), `{p}-banner`, `{p}-qty`, `{p}-ingredient`,
 * `{p}-step` (+ `{p}-final`), `{p}-step-text` (step text wrapper, only when
 * `stepOrientation` is not horizontal).
 * Cells carry `data-key` with the ingredient/step key.
 */
export function renderHtml(recipe: Recipe, options: RenderHtmlOptions = {}): string {
  const p = options.classPrefix ?? 'trd';
  const grid = layout(recipe, options);
  const tableClasses = [`${p}-table`];
  if (options.stickyIngredients) tableClasses.push(`${p}-sticky`);
  if (!grid.valid) tableClasses.push(`${p}-invalid`);
  const orientation = options.stepOrientation ?? 'horizontal';
  if (orientation === 'vertical') tableClasses.push(`${p}-vsteps`);
  const wrapClasses = [`${p}-wrap`];
  if (orientation === 'auto') wrapClasses.push(`${p}-auto`);
  const wrapStepText = orientation !== 'horizontal';

  const cellHtml = (cell: Cell) => {
    const classes = [`${p}-${cell.kind === 'quantity' ? 'qty' : cell.kind}`];
    if (cell.final) classes.push(`${p}-final`);
    const attrs = [`class="${classes.join(' ')}"`, `data-key="${escapeHtml(cell.key)}"`];
    if (cell.rowSpan > 1) attrs.push(`rowspan="${cell.rowSpan}"`);
    if (cell.colSpan > 1) attrs.push(`colspan="${cell.colSpan}"`);
    const text = escapeHtml(cell.text);
    const content =
      wrapStepText && cell.kind === 'step' ? `<span class="${p}-step-text">${text}</span>` : text;
    return `<td ${attrs.join(' ')}>${content}</td>`;
  };

  const parts: string[] = [
    `<div class="${wrapClasses.join(' ')}">`,
    `<table class="${tableClasses.join(' ')}">`,
  ];
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
