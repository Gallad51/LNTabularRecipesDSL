import { describe, expect, it } from 'vitest';
import { formatExactQuantity, formatQuantity, parseQuantity, scale } from '../src/quantity';
import { gratin } from './fixtures';

describe('formatQuantity', () => {
  it('rounds to 2 decimals and trims zeros', () => {
    expect(formatQuantity(1.5)).toBe('1.5');
    expect(formatQuantity(2)).toBe('2');
    expect(formatQuantity(1 / 3)).toBe('0.33');
    expect(formatQuantity(2.999)).toBe('3');
    expect(formatQuantity(1.5, { decimalSeparator: ',' })).toBe('1,5');
    expect(formatQuantity(1.23456, { maxDecimals: 3 })).toBe('1.235');
  });
  it('never shows a positive amount as 0', () => {
    expect(formatQuantity(0.004)).toBe('0.004');
    expect(formatQuantity(0.0041, { decimalSeparator: ',' })).toBe('0,0041');
    expect(formatQuantity(0)).toBe('0');
  });
});

describe('formatExactQuantity', () => {
  it('is lossless', () => {
    expect(formatExactQuantity(1 / 3)).toBe(String(1 / 3));
    expect(formatExactQuantity(1.5, ',')).toBe('1,5');
    expect(formatExactQuantity(1e-7)).toBe('0.0000001');
  });
});

describe('parseQuantity', () => {
  it('parses integers, decimals and fractions', () => {
    expect(parseQuantity('3')).toBe(3);
    expect(parseQuantity('1,5')).toBe(1.5);
    expect(parseQuantity('1.5')).toBe(1.5);
    expect(parseQuantity('1/2')).toBe(0.5);
    expect(parseQuantity('1/0')).toBe(Infinity);
    expect(parseQuantity('abc')).toBeUndefined();
    expect(parseQuantity('1.')).toBeUndefined();
  });
});

describe('scale', () => {
  it('multiplies quantities and leaves the rest untouched', () => {
    const r = gratin();
    const scaled = scale(r, 2);
    expect(scaled.ingredients[0]).toEqual({
      key: 'pdt',
      name: 'Pommes de terre',
      quantity: 3,
      unit: 'kg',
    });
    expect(scaled.ingredients[5]).toEqual({ key: 'sel', name: 'Sel' });
    expect(scaled.steps).toEqual(r.steps);
    expect(r.ingredients[0]!.quantity).toBe(1.5);
  });
  it('rejects invalid factors', () => {
    expect(() => scale(gratin(), 0)).toThrow(RangeError);
    expect(() => scale(gratin(), NaN)).toThrow(RangeError);
  });
});
