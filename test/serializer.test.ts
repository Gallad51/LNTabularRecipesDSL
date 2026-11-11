import { describe, expect, it } from 'vitest';
import { parse } from '../src/dsl/parser';
import { serialize } from '../src/dsl/serializer';
import { normalize } from '../src/normalize';
import type { Recipe } from '../src/model';
import { gratin } from './fixtures';

function roundTrip(recipe: Recipe, options = {}) {
  const text = serialize(recipe, options);
  const result = parse(text, options);
  if (!result.ok) throw new Error(`${text}\n${JSON.stringify(result.diagnostics, null, 2)}`);
  expect(result.recipe).toEqual(normalize(recipe, options));
  return text;
}

describe('serialize', () => {
  it('writes the gratin in canonical form, with chains', () => {
    expect(serialize(gratin())).toBe(`before: Préchauffer le four à 180 °C

pdt[1.5 kg Pommes de terre] --> tranche(Éplucher, trancher finement)
ail[1 pcs Ail (gousse)] & beurre[20 g Beurre] --> plat(Frotter le plat à l'ail, puis le beurrer)
creme[500 ml Crème liquide] & lait[250 ml Lait] & sel[Sel] & musc[Muscade] --> melange(Mélanger) --> chaud(Porter à frémissement)
tranche & plat & chaud --> monte(Disposer en couches dans le plat, napper de la crème chaude) --> cuisson(Cuire 1 h)
`);
    roundTrip(gratin());
  });

  it('honours the decimal separator', () => {
    expect(serialize(gratin(), { decimalSeparator: ',' })).toContain('pdt[1,5 kg Pommes de terre]');
    roundTrip(gratin(), { decimalSeparator: ',' });
  });

  it('writes drafts, prerequisites only and the empty recipe', () => {
    const draft: Recipe = {
      prerequisites: ['Sortir le beurre'],
      ingredients: [
        { key: 'b', name: 'Beurre', quantity: 250, unit: 'g' },
        { key: 'a', name: 'Sucre' },
      ],
      steps: [],
    };
    expect(serialize(draft)).toBe('before: Sortir le beurre\n\nb[250 g Beurre]\na[Sucre]\n');
    roundTrip(draft);
    expect(serialize({ prerequisites: ['A'], ingredients: [], steps: [] })).toBe('before: A\n');
    expect(serialize({ prerequisites: [], ingredients: [], steps: [] })).toBe('');
  });

  it('quotes only when needed, and every tricky label reads back', () => {
    const tricky: Recipe = {
      prerequisites: ['Compter 100 %% du temps', '"Bio" avant tout', 'Normal'],
      ingredients: [
        { key: 'a', name: '4 épices' },
        { key: 'b', name: 'g truc', quantity: 3 },
        { key: 'c', name: 'g', quantity: 3 },
        { key: 'd', name: 'Pommes ][', quantity: 2, unit: 'kg' },
        { key: 'e', name: 'Sauce "maison"' },
        { key: 'f', name: '"Bio" lait', quantity: 1, unit: 'l' },
        { key: 'g', name: 'Ail (gousse) [bio]' },
        { key: 'h', name: 'Back\\slash ]', quantity: 1 / 3 },
        { key: 'i', name: '1/2 citron' },
      ],
      steps: [
        { key: 's1', text: 'Mix (well) & stir --> ok', inputs: ['a', 'b', 'c'] },
        { key: 's2', text: 'Cuire (1 h', inputs: ['d', 'e'] },
        { key: 's3', text: '"Quoted" start', inputs: ['f', 'g', 'h', 'i'] },
        { key: 's4', text: 'Fin %% 100', inputs: ['s1', 's2', 's3'] },
      ],
    };
    const text = roundTrip(tricky);
    expect(text).toContain('before: "Compter 100 %% du temps"');
    expect(text).toContain('before: "\\"Bio\\" avant tout"');
    expect(text).toContain('before: Normal');
    expect(text).toContain('a["4 épices"]');
    expect(text).toContain('b[3 "g truc"]');
    expect(text).toContain('c[3 g]');
    expect(text).toContain('d[2 kg "Pommes ]["]');
    expect(text).toContain('e[Sauce "maison"]');
    expect(text).toContain('f[1 l "\\"Bio\\" lait"]');
    expect(text).toContain('g[Ail (gousse) [bio]]');
    expect(text).toContain('i["1/2 citron"]');
    expect(text).toContain('s1(Mix (well) & stir --> ok)');
    expect(text).toContain('s2("Cuire (1 h")');
    expect(text).toContain('s3("\\"Quoted\\" start")');
    expect(text).toContain('s4(Fin %% 100)');
  });

  it('does not chain when the next step has other inputs', () => {
    const r: Recipe = {
      prerequisites: [],
      ingredients: [
        { key: 'a', name: 'A' },
        { key: 'b', name: 'B' },
      ],
      steps: [
        { key: 's1', text: 'One', inputs: ['a'] },
        { key: 's2', text: 'Two', inputs: ['s1', 'b'] },
      ],
    };
    expect(serialize(r)).toBe('a[A] --> s1(One)\ns1 & b[B] --> s2(Two)\n');
    roundTrip(r);
  });

  it('keeps a valid but non-default step order', () => {
    const r: Recipe = {
      prerequisites: [],
      ingredients: [
        { key: 'x', name: 'X' },
        { key: 'y', name: 'Y' },
      ],
      steps: [
        { key: 'sy', text: 'Y', inputs: ['y'] },
        { key: 'sx', text: 'X', inputs: ['x'] },
        { key: 'end', text: 'End', inputs: ['sx', 'sy'] },
      ],
    };
    roundTrip(r);
  });

  it('writes invalid recipes best-effort so the parser can point at the problems', () => {
    const r: Recipe = {
      prerequisites: [],
      ingredients: [
        { key: 'a', name: 'A' },
        { key: 'u', name: 'Unused' },
      ],
      steps: [{ key: 's', text: 'S', inputs: ['a', 'ghost'] }],
    };
    const text = serialize(r);
    expect(text).toBe('a[A] & ghost --> s(S)\nu[Unused]\n');
    expect(parse(text).diagnostics.map((d) => d.code)).toEqual(['UNDEFINED_NODE']);
  });
});
