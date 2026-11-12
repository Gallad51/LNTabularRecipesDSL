import { describe, expect, it } from 'vitest';
import { layout, type Cell } from '../src/layout';
import { forestOrder, isForest, normalize } from '../src/normalize';
import { renderHtml } from '../src/html';
import { validate } from '../src/validate';
import type { Recipe } from '../src/model';
import { gratin } from './fixtures';

function compact(cell: Cell) {
  const base: (string | number)[] = [cell.kind, cell.key, cell.col, cell.rowSpan, cell.colSpan];
  if (cell.final) base.push('final');
  if (cell.open) base.push('open');
  return base;
}
const partialGrid = (recipe: Recipe) =>
  layout(recipe, { partial: true }).rows.map((cells) => cells.map(compact));

const ing = (key: string) => ({ key, name: key.toUpperCase() });

/** Every slot of the grid covered exactly once. */
function coveredOnce(recipe: Recipe) {
  const l = layout(recipe, { partial: true });
  const covered = l.rows.map(() => new Array<number>(l.columnCount).fill(0));
  for (const cells of l.rows) {
    for (const c of cells) {
      for (let r = c.row; r < c.row + c.rowSpan; r++) {
        for (let k = c.col; k < c.col + c.colSpan; k++) covered[r]![k]!++;
      }
    }
  }
  return covered.flat().every((n) => n === 1);
}

/** a, b, c, d; b and d combined, then that step chained; a and c untouched. */
const forest = (): Recipe => ({
  prerequisites: [],
  ingredients: ['a', 'b', 'c', 'd'].map(ing),
  steps: [
    { key: 's1', text: 'Mix', inputs: ['b', 'd'] },
    { key: 's2', text: 'Rest', inputs: ['s1'] },
    { key: 't1', text: 'Cut', inputs: ['c'] },
  ],
});

describe('isForest', () => {
  it('accepts unfinished trees, rejects structural errors', () => {
    expect(isForest(validate(forest()))).toBe(true);
    expect(isForest(validate(gratin()))).toBe(true);
    const twice: Recipe = {
      ...forest(),
      steps: [
        { key: 's1', text: 'Mix', inputs: ['b'] },
        { key: 's2', text: 'Again', inputs: ['b'] },
      ],
    };
    expect(isForest(validate(twice))).toBe(false);
    const unknown: Recipe = { ...forest(), steps: [{ key: 's', text: 'x', inputs: ['zz'] }] };
    expect(isForest(validate(unknown))).toBe(false);
  });

  it('tolerates non-structural problems (empty text)', () => {
    const r = forest();
    r.steps[0]!.text = ' ';
    expect(isForest(validate(r))).toBe(true);
  });
});

describe('forestOrder / normalize partial', () => {
  it('groups each subtree at the position of its first ingredient', () => {
    expect(forestOrder(forest()).map((i) => i.key)).toEqual(['a', 'b', 'd', 'c']);
  });

  it('is only applied with the partial option', () => {
    expect(normalize(forest()).ingredients.map((i) => i.key)).toEqual(['a', 'b', 'c', 'd']);
    expect(normalize(forest(), { partial: true }).ingredients.map((i) => i.key)).toEqual([
      'a',
      'b',
      'd',
      'c',
    ]);
  });

  it('equals the tree order on a complete tree', () => {
    const r = gratin();
    r.ingredients.reverse();
    expect(normalize(r, { partial: true })).toEqual(gratin());
  });
});

describe('layout partial', () => {
  it('without the option, a forest falls back to the draft layout', () => {
    const l = layout(forest());
    expect(l.valid).toBe(false);
    expect(l.columnCount).toBe(2);
    expect(l.rows.flat().some((c) => c.kind === 'step' || c.open)).toBe(false);
  });

  it('lays out every subtree and flags open cells', () => {
    const l = layout(forest(), { partial: true });
    expect(l.valid).toBe(false);
    expect(l.columnCount).toBe(4);
    expect(partialGrid(forest())).toEqual([
      [
        ['quantity', 'a', 0, 1, 1, 'open'],
        ['ingredient', 'a', 1, 1, 3, 'open'],
      ],
      [
        ['quantity', 'b', 0, 1, 1],
        ['ingredient', 'b', 1, 1, 1],
        ['step', 's1', 2, 2, 1],
        ['step', 's2', 3, 2, 1, 'open'],
      ],
      [
        ['quantity', 'd', 0, 1, 1],
        ['ingredient', 'd', 1, 1, 1],
      ],
      [
        ['quantity', 'c', 0, 1, 1],
        ['ingredient', 'c', 1, 1, 1],
        ['step', 't1', 2, 1, 2, 'open'],
      ],
    ]);
    expect(coveredOnce(forest())).toBe(true);
  });

  it('a draft in partial mode has every ingredient open', () => {
    const draft: Recipe = { prerequisites: [], ingredients: [ing('a'), ing('b')], steps: [] };
    expect(partialGrid(draft)).toEqual([
      [
        ['quantity', 'a', 0, 1, 1, 'open'],
        ['ingredient', 'a', 1, 1, 1, 'open'],
      ],
      [
        ['quantity', 'b', 0, 1, 1, 'open'],
        ['ingredient', 'b', 1, 1, 1, 'open'],
      ],
    ]);
    expect(
      layout(draft)
        .rows.flat()
        .some((c) => c.open),
    ).toBe(false);
  });

  it('a complete tree is laid out exactly as without the option', () => {
    expect(layout(gratin(), { partial: true })).toEqual(layout(gratin()));
  });

  it('structural errors still fall back to the draft layout', () => {
    const r: Recipe = {
      prerequisites: [],
      ingredients: [ing('a')],
      steps: [
        { key: 's1', text: 'x', inputs: ['a'] },
        { key: 's2', text: 'y', inputs: ['a'] },
      ],
    };
    const l = layout(r, { partial: true });
    expect(l.columnCount).toBe(2);
    expect(l.rows.flat().some((c) => c.kind === 'step' || c.open)).toBe(false);
  });

  it('covers the grid exactly once while the gratin is being built', () => {
    const full = gratin();
    for (let n = 0; n <= full.steps.length; n++) {
      const r: Recipe = { ...full, steps: full.steps.slice(0, n) };
      expect(coveredOnce(r)).toBe(true);
    }
  });

  it('renderHtml marks open cells', () => {
    const html = renderHtml(forest(), { partial: true });
    expect(html).toContain('class="trd-step trd-open" data-key="s2"');
    expect(renderHtml(forest())).not.toContain('trd-open');
  });
});
