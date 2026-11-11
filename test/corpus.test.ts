import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  layout,
  normalize,
  parse,
  renderHtml,
  serialize,
  validate,
  type Recipe,
} from '../src/index';
import { gratin } from './fixtures';

const dir = join(__dirname, '..', 'examples');
const names = readdirSync(dir)
  .filter((f) => f.endsWith('.trecipe'))
  .map((f) => f.replace(/\.trecipe$/, ''));

function load(name: string) {
  const text = readFileSync(join(dir, `${name}.trecipe`), 'utf8');
  const expected = JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8')) as Recipe;
  return { text, expected };
}

describe('example corpus', () => {
  it('has at least 6 examples', () => {
    expect(names.length).toBeGreaterThanOrEqual(6);
  });

  it('the gratin example matches the reference model', () => {
    expect(load('gratin-dauphinois').expected).toEqual(gratin());
  });

  describe.each(names)('%s', (name) => {
    const { text, expected } = load(name);

    it('parses to the expected JSON model', () => {
      const result = parse(text);
      expect(result.diagnostics).toEqual([]);
      expect(result.ok && result.recipe).toEqual(expected);
    });

    it('the expected model is valid and normalized', () => {
      expect(validate(expected)).toEqual([]);
      expect(normalize(expected)).toEqual(expected);
    });

    it.each(['.', ','] as const)(
      'round-trips through serialize (decimal "%s")',
      (decimalSeparator) => {
        const written = serialize(expected, { decimalSeparator });
        const reparsed = parse(written);
        expect(reparsed.ok && reparsed.recipe).toEqual(normalize(expected));
        expect(serialize(reparsed.ok ? reparsed.recipe : expected, { decimalSeparator })).toBe(
          written,
        );
      },
    );

    it('lays out without holes or overlaps', () => {
      const grid = layout(expected);
      const covered = grid.rows.map(() => new Array<number>(grid.columnCount).fill(0));
      for (const cells of grid.rows) {
        for (const c of cells) {
          for (let r = c.row; r < c.row + c.rowSpan; r++) {
            for (let k = c.col; k < c.col + c.colSpan; k++) covered[r]![k]!++;
          }
        }
      }
      expect(covered.flat().every((n) => n === 1)).toBe(true);
      expect(renderHtml(expected)).toContain('<table');
    });
  });
});
