import { describe, expect, it } from 'vitest';
import { parse } from '../src/dsl/parser';
import { gratin } from './fixtures';

const GRATIN = `%% Gratin dauphinois
before: Préchauffer le four à 180 °C

pdt[1,5 kg Pommes de terre] --> tranche(Éplucher, trancher finement)
ail[1 pcs Ail (gousse)] & beurre[20 g Beurre] --> plat("Frotter le plat à l'ail, puis le beurrer")
creme[500 ml Crème liquide] & lait[250 ml Lait] & sel[Sel] & musc[Muscade] --> melange(Mélanger) --> chaud(Porter à frémissement)
tranche & plat & chaud --> monte(Disposer en couches dans le plat, napper de la crème chaude) --> cuisson(Cuire 1 h)
`;

/** [code, line, column, endColumn] of every diagnostic. */
function diags(text: string) {
  const result = parse(text);
  return result.diagnostics.map((d) => [d.code, d.line, d.column, d.endColumn]);
}

function recipe(text: string) {
  const result = parse(text);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics, null, 2));
  return result.recipe;
}

describe('parse — valid documents', () => {
  it('parses the gratin into the expected model', () => {
    expect(recipe(GRATIN)).toEqual(gratin());
  });

  it('accepts CRLF, trailing comments and extra blanks', () => {
    const text = 'a[Sel]   %% comment\r\n\r\n   a  -->  s ( Saler )  %% done\r\n';
    expect(recipe(text)).toEqual({
      prerequisites: [],
      ingredients: [{ key: 'a', name: 'Sel' }],
      steps: [{ key: 's', text: 'Saler', inputs: ['a'] }],
    });
  });

  it('parses quantities: decimals, fractions, glued units, unknown units', () => {
    const r = recipe(
      `a[1/2 l Lait] & b[500g Farine] & c[2 oeufs] & d[3 KG Pommes] & e[4-épices] & f[500 g] --> s(Mix)`,
    );
    expect(r.ingredients).toEqual([
      { key: 'a', name: 'Lait', quantity: 0.5, unit: 'l' },
      { key: 'b', name: 'Farine', quantity: 500, unit: 'g' },
      { key: 'c', name: 'oeufs', quantity: 2 },
      { key: 'd', name: 'Pommes', quantity: 3, unit: 'kg' },
      { key: 'e', name: '4-épices' },
      { key: 'f', name: 'g', quantity: 500 },
    ]);
  });

  it('supports quoted labels with escapes and a quantity prefix', () => {
    const r = recipe(
      'a["4 épices"] & b[2 kg "Pommes ]["] & c[Sauce "maison"] --> s("Cuire \\"bien\\" (1 h) \\\\ ok")',
    );
    expect(r.ingredients).toEqual([
      { key: 'a', name: '4 épices' },
      { key: 'b', name: 'Pommes ][', quantity: 2, unit: 'kg' },
      { key: 'c', name: 'Sauce "maison"' },
    ]);
    expect(r.steps[0]!.text).toBe('Cuire "bien" (1 h) \\ ok');
  });

  it('allows balanced delimiters, & and --> inside unquoted labels', () => {
    const r = recipe('a[Ail (gousse) [bio]] --> s(Mix (well) & stir --> serve)');
    expect(r.ingredients[0]!.name).toBe('Ail (gousse) [bio]');
    expect(r.steps[0]!.text).toBe('Mix (well) & stir --> serve');
  });

  it('accepts forward references and edges split over several lines', () => {
    const r = recipe(`
fin --> service(Servir)
a & b --> fin
a[A]
b[B]
c[C] --> fin(Finir)
`);
    expect(r.steps).toEqual([
      { key: 'fin', text: 'Finir', inputs: ['a', 'b', 'c'] },
      { key: 'service', text: 'Servir', inputs: ['fin'] },
    ]);
    expect(r.ingredients.map((i) => i.key)).toEqual(['a', 'b', 'c']);
  });

  it('orders steps topologically, ties by first mention', () => {
    const r = recipe(`
s2 & s1 --> s3(Three)
y[Y] --> s2(Two)
x[X] --> s1(One)
`);
    expect(r.steps.map((s) => s.key)).toEqual(['s2', 's1', 's3']);
    expect(r.ingredients.map((i) => i.key)).toEqual(['y', 'x']);
  });

  it('parses drafts, prerequisites only and empty documents', () => {
    expect(recipe('a[1 g A]\nb[B]')).toEqual({
      prerequisites: [],
      ingredients: [
        { key: 'a', name: 'A', quantity: 1, unit: 'g' },
        { key: 'b', name: 'B' },
      ],
      steps: [],
    });
    expect(recipe('before: "Préchauffer %% vraiment"\nbefore: Sortir le beurre %% tôt')).toEqual({
      prerequisites: ['Préchauffer %% vraiment', 'Sortir le beurre'],
      ingredients: [],
      steps: [],
    });
    expect(recipe('')).toEqual({ prerequisites: [], ingredients: [], steps: [] });
  });

  it('uses custom units', () => {
    const r = parse('a[2 cups Flour] --> s(Mix)', { units: ['cup', 'cups'] });
    expect(r.ok && r.recipe.ingredients[0]).toEqual({
      key: 'a',
      name: 'Flour',
      quantity: 2,
      unit: 'cups',
    });
  });

  it('a node id may be "before" when not followed by ":"', () => {
    expect(recipe('before[Beurre] --> s(Fondre)').ingredients[0]!.key).toBe('before');
  });
});

describe('parse — diagnostics with positions', () => {
  it('SYNTAX_ERROR', () => {
    expect(diags('a[A] --> s(S)\na[A] $')).toEqual([['SYNTAX_ERROR', 2, 6, 7]]);
    expect(diags('a[A] -->')).toEqual([['SYNTAX_ERROR', 1, 9, 10]]);
    expect(diags('a & b')).toEqual([['SYNTAX_ERROR', 1, 6, 7]]);
    expect(diags('a')).toEqual([['SYNTAX_ERROR', 1, 2, 3]]);
    expect(diags('a[A] --> s(S) b')).toEqual([['SYNTAX_ERROR', 1, 15, 16]]);
    expect(diags('a[1 kg "x" y] --> s(S)')).toEqual([['SYNTAX_ERROR', 1, 12, 13]]);
    expect(diags('before: "x" y')).toEqual([['SYNTAX_ERROR', 1, 13, 14]]);
    const [d] = parse('a[A] $').diagnostics;
    expect(d!.params).toEqual({ expected: 'a node, "&" or "-->"', found: '"$"' });
  });

  it('UNTERMINATED_STRING and UNTERMINATED_LABEL', () => {
    expect(diags('a["A] --> s(S)')).toEqual([['UNTERMINATED_STRING', 1, 3, 15]]);
    expect(diags('before: "x')).toEqual([['UNTERMINATED_STRING', 1, 9, 11]]);
    expect(diags('a[A --> s(S)')).toEqual([['UNTERMINATED_LABEL', 1, 2, 13]]);
    expect(parse('s(S').diagnostics[0]!.params).toEqual({ close: ')' });
  });

  it('a lexical error does not cascade into UNDEFINED_NODE', () => {
    expect(diags('a[A --> s(S)\na --> t(T)')).toEqual([['UNTERMINATED_LABEL', 1, 2, 13]]);
  });

  it('FAN_OUT', () => {
    expect(diags('a[A] --> s(S) & t(T)')).toEqual([['FAN_OUT', 1, 15, 16]]);
  });

  it('UNDEFINED_NODE', () => {
    expect(diags('a[A] & zz --> s(S)')).toEqual([['UNDEFINED_NODE', 1, 8, 10]]);
  });

  it('REDEFINED_NODE', () => {
    const result = parse('a[A] --> s(S)\na[B]');
    expect(result.diagnostics.map((d) => [d.code, d.line, d.column, d.endColumn])).toEqual([
      ['REDEFINED_NODE', 2, 1, 2],
    ]);
    expect(result.diagnostics[0]!.params).toEqual({ key: 'a', firstLine: 1 });
  });

  it('INGREDIENT_AS_TARGET (inline and by reference)', () => {
    expect(diags('a[A] --> b[B]')).toEqual([['INGREDIENT_AS_TARGET', 1, 10, 14]]);
    expect(diags('b[B]\na[A] --> b')).toEqual([['INGREDIENT_AS_TARGET', 2, 10, 11]]);
  });

  it('INVALID_KEY', () => {
    const key = 'k'.repeat(41);
    expect(diags(`${key}[A] --> s(S)`)).toEqual([['INVALID_KEY', 1, 1, 42]]);
  });

  it('EMPTY_TEXT', () => {
    expect(diags('a[ ] --> s(S)')).toEqual([['EMPTY_TEXT', 1, 2, 5]]);
    expect(diags('a[500] --> s(S)')).toEqual([['EMPTY_TEXT', 1, 2, 7]]);
    expect(diags('a[A] --> s("  ")')).toEqual([['EMPTY_TEXT', 1, 11, 17]]);
    expect(diags('before:   ')).toEqual([['EMPTY_TEXT', 1, 1, 11]]);
  });

  it('INVALID_QUANTITY', () => {
    expect(diags('a[0 g A] & b[1/0 B] --> s(S)')).toEqual([
      ['INVALID_QUANTITY', 1, 2, 9],
      ['INVALID_QUANTITY', 1, 13, 20],
    ]);
    expect(parse('a[0 g A]').diagnostics[0]!.params).toEqual({ quantity: '0' });
  });

  it('NO_INPUT', () => {
    expect(diags('a[A] --> s(S)\nt(T)')).toEqual([
      ['MULTIPLE_ROOTS', 1, 10, 14],
      ['NO_INPUT', 2, 1, 5],
    ]);
  });

  it('MULTIPLE_CONSUMERS', () => {
    expect(diags('a[A] --> s(S)\na --> t(T)\ns --> t')).toEqual([['MULTIPLE_CONSUMERS', 2, 1, 2]]);
    expect(diags('a[A] & a --> s(S)')).toEqual([['MULTIPLE_CONSUMERS', 1, 8, 9]]);
  });

  it('UNCONSUMED', () => {
    expect(diags('a[A] --> s(S)\nb[B]')).toEqual([['UNCONSUMED', 2, 1, 5]]);
  });

  it('MULTIPLE_ROOTS names the final step', () => {
    const result = parse('a[A] --> s(S)\nb[B] --> t(T)');
    expect(result.diagnostics.map((d) => [d.code, d.line, d.column, d.endColumn])).toEqual([
      ['MULTIPLE_ROOTS', 1, 10, 14],
    ]);
    expect(result.diagnostics[0]!.params).toEqual({ key: 's', root: 't' });
  });

  it('CYCLE', () => {
    const result = parse('a[A] --> s(S)\ns --> t(T) --> u(U)\nu --> t');
    expect(result.diagnostics.map((d) => [d.code, d.line, d.column, d.endColumn])).toEqual([
      ['CYCLE', 2, 7, 11],
    ]);
    expect(result.diagnostics[0]!.params).toEqual({ keys: 't, u' });
    expect(diags('a[A] --> s(S) --> s')).toEqual([['CYCLE', 1, 10, 14]]);
  });

  it('reports several problems at once, sorted by position, with a partial recipe', () => {
    const result = parse('a[0 A] --> s(S)\nb[B]\nc[C] --> b');
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((d) => d.code)).toEqual([
      'INVALID_QUANTITY',
      'INGREDIENT_AS_TARGET',
    ]);
    expect(!result.ok && result.partial?.steps.map((s) => s.key)).toEqual(['s']);
  });
});
