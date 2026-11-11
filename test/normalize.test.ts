import { describe, expect, it } from 'vitest';
import { normalize } from '../src/normalize';
import type { Recipe } from '../src/model';
import { gratin } from './fixtures';

describe('normalize', () => {
  it('is idempotent on a normalized recipe', () => {
    expect(normalize(gratin())).toEqual(gratin());
    expect(normalize(normalize(gratin()))).toEqual(gratin());
  });

  it('reorders ingredients depth-first from the final step', () => {
    const r = gratin();
    r.ingredients.reverse();
    expect(normalize(r).ingredients.map((i) => i.key)).toEqual(
      gratin().ingredients.map((i) => i.key),
    );
  });

  it('trims, canonicalises units and drops empty/undefined fields', () => {
    const r: Recipe = {
      prerequisites: ['  Préchauffer  '],
      ingredients: [
        { key: ' a ', name: ' A ', quantity: 2, unit: ' KG ' },
        { key: 'b', name: 'B', quantity: undefined, unit: '  ' },
      ],
      steps: [{ key: 's', text: ' Mix ', inputs: [' b ', 'a'] }],
    };
    const n = normalize(r);
    expect(n).toEqual({
      prerequisites: ['Préchauffer'],
      ingredients: [
        { key: 'b', name: 'B' },
        { key: 'a', name: 'A', quantity: 2, unit: 'kg' },
      ],
      steps: [{ key: 's', text: 'Mix', inputs: ['b', 'a'] }],
    });
    expect(Object.keys(n.ingredients[0]!)).toEqual(['key', 'name']);
  });

  it('keeps the given order for drafts and invalid recipes, and never throws', () => {
    const draft: Recipe = {
      prerequisites: [],
      ingredients: [
        { key: 'z', name: 'Z' },
        { key: 'a', name: 'A' },
      ],
      steps: [],
    };
    expect(normalize(draft).ingredients.map((i) => i.key)).toEqual(['z', 'a']);
    const invalid: Recipe = { ...draft, steps: [{ key: 's', text: 'x', inputs: ['a'] }] };
    expect(normalize(invalid).ingredients.map((i) => i.key)).toEqual(['z', 'a']);
  });
});
