import { describe, expect, it } from 'vitest';
import { layout, type Cell } from '../src/layout';
import type { Recipe } from '../src/model';
import { gratin } from './fixtures';

/** Compact view of a cell: [kind, key, col, rowSpan, colSpan] (+ 'final'). */
function compact(cell: Cell) {
  const base: (string | number)[] = [cell.kind, cell.key, cell.col, cell.rowSpan, cell.colSpan];
  return cell.final ? [...base, 'final'] : base;
}
const grid = (recipe: Recipe) => layout(recipe).rows.map((cells) => cells.map(compact));

const ing = (key: string, extra: Partial<Recipe['ingredients'][number]> = {}) => ({
  key,
  name: key.toUpperCase(),
  ...extra,
});

describe('layout', () => {
  it('lays out the gratin exactly like the reference drawing', () => {
    const l = layout(gratin(), { decimalSeparator: ',' });
    expect(l.valid).toBe(true);
    expect(l.columnCount).toBe(6);
    expect(l.banners).toEqual(['Préchauffer le four à 180 °C']);
    expect(l.rows.map((cells) => cells.map(compact))).toEqual([
      [
        ['quantity', 'pdt', 0, 1, 1],
        ['ingredient', 'pdt', 1, 1, 1],
        ['step', 'tranche', 2, 1, 2],
        ['step', 'monte', 4, 7, 1],
        ['step', 'cuisson', 5, 7, 1, 'final'],
      ],
      [
        ['quantity', 'ail', 0, 1, 1],
        ['ingredient', 'ail', 1, 1, 1],
        ['step', 'plat', 2, 2, 2],
      ],
      [
        ['quantity', 'beurre', 0, 1, 1],
        ['ingredient', 'beurre', 1, 1, 1],
      ],
      [
        ['quantity', 'creme', 0, 1, 1],
        ['ingredient', 'creme', 1, 1, 1],
        ['step', 'melange', 2, 4, 1],
        ['step', 'chaud', 3, 4, 1],
      ],
      [
        ['quantity', 'lait', 0, 1, 1],
        ['ingredient', 'lait', 1, 1, 1],
      ],
      [
        ['quantity', 'sel', 0, 1, 1],
        ['ingredient', 'sel', 1, 1, 1],
      ],
      [
        ['quantity', 'musc', 0, 1, 1],
        ['ingredient', 'musc', 1, 1, 1],
      ],
    ]);
    expect(l.rows.map((cells) => cells[0]!.text)).toEqual([
      '1,5 kg',
      '1 pcs',
      '20 g',
      '500 ml',
      '250 ml',
      '',
      '',
    ]);
    expect(l.rows[0]![1]).toMatchObject({ text: 'Pommes de terre', row: 0 });
    expect(l.rows[3]![2]).toMatchObject({ text: 'Mélanger', row: 3 });
  });

  it('every grid slot is covered exactly once (no holes, no overlaps)', () => {
    const l = layout(gratin());
    const covered = l.rows.map(() => new Array<number>(l.columnCount).fill(0));
    for (const cells of l.rows) {
      for (const c of cells) {
        for (let r = c.row; r < c.row + c.rowSpan; r++) {
          for (let k = c.col; k < c.col + c.colSpan; k++) covered[r]![k]!++;
        }
      }
    }
    expect(covered.flat().every((n) => n === 1)).toBe(true);
  });

  it('linear chain', () => {
    const r: Recipe = {
      prerequisites: [],
      ingredients: [ing('a', { quantity: 2, unit: 'g' })],
      steps: [
        { key: 's1', text: 'One', inputs: ['a'] },
        { key: 's2', text: 'Two', inputs: ['s1'] },
        { key: 's3', text: 'Three', inputs: ['s2'] },
      ],
    };
    expect(layout(r).columnCount).toBe(5);
    expect(grid(r)).toEqual([
      [
        ['quantity', 'a', 0, 1, 1],
        ['ingredient', 'a', 1, 1, 1],
        ['step', 's1', 2, 1, 1],
        ['step', 's2', 3, 1, 1],
        ['step', 's3', 4, 1, 1, 'final'],
      ],
    ]);
  });

  it('wide fan-in', () => {
    const r: Recipe = {
      prerequisites: [],
      ingredients: ['a', 'b', 'c', 'd'].map((k) => ing(k)),
      steps: [{ key: 's', text: 'Mix', inputs: ['a', 'b', 'c', 'd'] }],
    };
    expect(layout(r).columnCount).toBe(3);
    expect(grid(r)).toEqual([
      [
        ['quantity', 'a', 0, 1, 1],
        ['ingredient', 'a', 1, 1, 1],
        ['step', 's', 2, 4, 1, 'final'],
      ],
      ...['b', 'c', 'd'].map((k) => [
        ['quantity', k, 0, 1, 1],
        ['ingredient', k, 1, 1, 1],
      ]),
    ]);
  });

  it('uneven depths: shallow steps and ingredients stretch to their consumer', () => {
    const r: Recipe = {
      prerequisites: [],
      ingredients: [ing('a'), ing('x'), ing('b')],
      steps: [
        { key: 's1', text: '1', inputs: ['a'] },
        { key: 's2', text: '2', inputs: ['s1'] },
        { key: 't1', text: 't', inputs: ['x'] },
        { key: 'end', text: 'End', inputs: ['s2', 't1', 'b'] },
      ],
    };
    expect(layout(r).columnCount).toBe(5);
    expect(grid(r)).toEqual([
      [
        ['quantity', 'a', 0, 1, 1],
        ['ingredient', 'a', 1, 1, 1],
        ['step', 's1', 2, 1, 1],
        ['step', 's2', 3, 1, 1],
        ['step', 'end', 4, 3, 1, 'final'],
      ],
      [
        ['quantity', 'x', 0, 1, 1],
        ['ingredient', 'x', 1, 1, 1],
        ['step', 't1', 2, 1, 2],
      ],
      [
        ['quantity', 'b', 0, 1, 1],
        ['ingredient', 'b', 1, 1, 3], // feeds the depth-3 step directly
      ],
    ]);
  });

  it('lays out a reordered input list in tree order', () => {
    const r: Recipe = {
      prerequisites: [],
      ingredients: [ing('b'), ing('a')],
      steps: [{ key: 's', text: 'S', inputs: ['a', 'b'] }],
    };
    expect(layout(r).rows.map((cells) => cells[0]!.key)).toEqual(['a', 'b']);
  });

  it('drafts get two columns', () => {
    const r: Recipe = {
      prerequisites: [],
      ingredients: [ing('a', { quantity: 1 / 3 }), ing('b')],
      steps: [],
    };
    const l = layout(r);
    expect(l).toMatchObject({ valid: true, columnCount: 2 });
    expect(grid(r)).toEqual([
      [
        ['quantity', 'a', 0, 1, 1],
        ['ingredient', 'a', 1, 1, 1],
      ],
      [
        ['quantity', 'b', 0, 1, 1],
        ['ingredient', 'b', 1, 1, 1],
      ],
    ]);
    expect(l.rows[0]![0]!.text).toBe('0.33');
  });

  it('displays units through unitLabels', () => {
    const r: Recipe = {
      prerequisites: [],
      ingredients: [
        ing('a', { quantity: 1, unit: 'pincee' }),
        ing('b', { quantity: 2, unit: 'g' }),
      ],
      steps: [],
    };
    const l = layout(r, { unitLabels: { pincee: 'pincée' } });
    expect(l.rows.map((cells) => cells[0]!.text)).toEqual(['1 pincée', '2 g']);
  });

  it('prerequisites become banners; the empty recipe has no rows', () => {
    const l = layout({ prerequisites: ['Préchauffer'], ingredients: [], steps: [] });
    expect(l).toEqual({ valid: true, columnCount: 2, banners: ['Préchauffer'], rows: [] });
  });

  it('invalid recipes fall back to the draft layout with valid=false', () => {
    const r: Recipe = {
      prerequisites: [],
      ingredients: [ing('a'), ing('b')],
      steps: [{ key: 's', text: 'S', inputs: ['a'] }],
    };
    const l = layout(r);
    expect(l.valid).toBe(false);
    expect(l.columnCount).toBe(2);
    expect(l.rows.flat().some((c) => c.kind === 'step')).toBe(false);
  });
});
