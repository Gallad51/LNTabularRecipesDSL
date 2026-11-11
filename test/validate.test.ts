import { describe, expect, it } from 'vitest';
import { validate } from '../src/validate';
import type { Recipe } from '../src/model';
import { gratin } from './fixtures';

const codes = (r: unknown) => validate(r).map((d) => [d.code, d.path?.join('.')]);

describe('validate', () => {
  it('accepts a valid tree', () => {
    expect(validate(gratin())).toEqual([]);
  });

  it('accepts drafts (no steps) and the empty recipe', () => {
    expect(
      validate({ prerequisites: [], ingredients: [{ key: 'a', name: 'A' }], steps: [] }),
    ).toEqual([]);
    expect(validate({ prerequisites: [], ingredients: [], steps: [] })).toEqual([]);
  });

  it('reports INVALID_SHAPE on untrusted input instead of throwing', () => {
    expect(codes(null)).toEqual([['INVALID_SHAPE', '']]);
    expect(codes({ prerequisites: 'x', ingredients: [], steps: {} })).toEqual([
      ['INVALID_SHAPE', 'prerequisites'],
      ['INVALID_SHAPE', 'steps'],
    ]);
    expect(
      codes({ prerequisites: [1], ingredients: [{ key: 'a', name: 2, quantity: '3' }], steps: [] }),
    ).toEqual([
      ['INVALID_SHAPE', 'prerequisites.0'],
      ['INVALID_SHAPE', 'ingredients.0.name'],
      ['INVALID_SHAPE', 'ingredients.0.quantity'],
    ]);
    expect(
      codes({ prerequisites: [], ingredients: [], steps: [{ key: 's', text: 'x', inputs: 'a' }] }),
    ).toEqual([['INVALID_SHAPE', 'steps.0.inputs']]);
  });

  it('reports key, text, quantity and unit problems', () => {
    const r: Recipe = {
      prerequisites: ['  '],
      ingredients: [
        { key: 'bad key', name: ' ' },
        { key: 'a', name: 'A', quantity: 0 },
        { key: 'a', name: 'B', quantity: Infinity },
        { key: 'c', name: 'C', unit: 'g' },
        { key: 'd', name: 'D', quantity: 1, unit: 'poignée' },
      ],
      steps: [],
    };
    expect(validate(r).map((d) => [d.code, d.path?.join('.'), d.severity])).toEqual([
      ['EMPTY_TEXT', 'prerequisites.0', 'error'],
      ['INVALID_KEY', 'ingredients.0.key', 'error'],
      ['EMPTY_TEXT', 'ingredients.0.name', 'error'],
      ['INVALID_QUANTITY', 'ingredients.1.quantity', 'error'],
      ['DUPLICATE_KEY', 'ingredients.2.key', 'error'],
      ['INVALID_QUANTITY', 'ingredients.2.quantity', 'error'],
      ['UNIT_WITHOUT_QUANTITY', 'ingredients.3.unit', 'error'],
      ['UNKNOWN_UNIT', 'ingredients.4.unit', 'warning'],
    ]);
  });

  it('honours a custom unit list, case-insensitively', () => {
    const r: Recipe = {
      prerequisites: [],
      ingredients: [{ key: 'a', name: 'A', quantity: 1, unit: 'CUP' }],
      steps: [],
    };
    expect(validate(r, { units: ['cup'] })).toEqual([]);
    expect(validate(r).map((d) => d.code)).toEqual(['UNKNOWN_UNIT']);
  });

  it('enforces the tree rules', () => {
    const r: Recipe = {
      prerequisites: [],
      ingredients: [
        { key: 'a', name: 'A' },
        { key: 'b', name: 'B' },
        { key: 'c', name: 'C' },
      ],
      steps: [
        { key: 's1', text: 'one', inputs: ['a', 'zzz', 's3'] },
        { key: 's2', text: 'two', inputs: ['a', 's1'] },
        { key: 's3', text: 'three', inputs: [] },
        { key: 'dup', text: 'four', inputs: ['b'] },
        { key: 'dup', text: 'five', inputs: ['s2'] },
      ],
    };
    expect(codes(r)).toEqual([
      ['DUPLICATE_KEY', 'steps.4.key'],
      ['UNKNOWN_REFERENCE', 'steps.0.inputs.1'],
      ['FORWARD_REFERENCE', 'steps.0.inputs.2'],
      ['MULTIPLE_CONSUMERS', 'steps.1.inputs.0'],
      ['NO_INPUT', 'steps.2.inputs'],
      ['UNCONSUMED', 'ingredients.2'],
      ['MULTIPLE_ROOTS', 'steps.2'],
      ['MULTIPLE_ROOTS', 'steps.3'],
    ]);
  });

  it('fills message params', () => {
    const [d] = validate({
      prerequisites: [],
      ingredients: [{ key: 'a', name: 'A' }],
      steps: [
        { key: 's1', text: 'x', inputs: ['a'] },
        { key: 's2', text: 'y', inputs: ['a'] },
      ],
    });
    expect(d).toMatchObject({
      code: 'MULTIPLE_CONSUMERS',
      params: { key: 'a', consumer: 's1' },
      message: '"a" is already used by step "s1"; each node feeds exactly one step.',
    });
  });
});
