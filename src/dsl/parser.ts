import { diagnostic, hasErrors, type Diagnostic, type DiagnosticCode } from '../diagnostics';
import {
  MAX_KEY_LENGTH,
  unitLookup,
  type Ingredient,
  type Recipe,
  type RecipeOptions,
  type Step,
} from '../model';
import { normalize } from '../normalize';
import { validate } from '../validate';
import { parseIngredientLabel } from './label';
import { lex, type IdentToken, type LabelToken, type Span, type Token } from './lexer';

export type ParseResult =
  | { ok: true; recipe: Recipe; diagnostics: Diagnostic[] }
  | { ok: false; diagnostics: Diagnostic[]; partial?: Recipe };

export type ParseOptions = Pick<RecipeOptions, 'units'>;

/** One occurrence of a node in the text: `id` or `id[label]` / `id(label)`. */
interface NodeRef {
  key: string;
  ident: IdentToken;
  label?: LabelToken;
  span: Span;
}

interface NodeInfo {
  key: string;
  /** Order of first mention in the document. */
  seq: number;
  first: NodeRef;
  def?: NodeRef;
  kind?: 'ingredient' | 'step';
  ingredient?: Ingredient;
  text?: string;
  inputs: string[];
  consumer?: string;
}

interface Edge {
  from: NodeRef;
  to: NodeRef;
}

/**
 * Codes that make tree-structure checks (NO_INPUT, CYCLE, UNCONSUMED,
 * MULTIPLE_ROOTS) meaningless: they would only cascade. Tree rules are checked
 * once the document is syntactically valid and every reference resolves.
 */
const BLOCKING: ReadonlySet<DiagnosticCode> = new Set([
  'SYNTAX_ERROR',
  'UNTERMINATED_LABEL',
  'UNTERMINATED_STRING',
  'FAN_OUT',
  'UNDEFINED_NODE',
  'REDEFINED_NODE',
  'INGREDIENT_AS_TARGET',
]);

/**
 * Parses a tabular-recipe document.
 *
 * On success, `recipe` is normalized (see {@link normalize}). On failure,
 * every diagnostic found is returned (sorted by position) together with a
 * best-effort `partial` recipe, handy for live previews.
 */
export function parse(source: string, options: ParseOptions = {}): ParseResult {
  const unitMap = unitLookup(options.units);
  const { lines, diagnostics } = lex(source, new Set(unitMap.keys()));
  const nodes = new Map<string, NodeInfo>();
  const prerequisites: string[] = [];
  const edges: Edge[] = [];
  const suppressed = new Set<string>(); // idents seen on failed lines: no UNDEFINED_NODE for them
  let seq = 0;

  const at = (span: Span) => ({
    line: span.line,
    column: span.column,
    endLine: span.line,
    endColumn: span.endColumn,
  });
  const report = (code: DiagnosticCode, params: Record<string, string | number>, span: Span) =>
    diagnostics.push(diagnostic(code, params, at(span)));

  const register = (ref: NodeRef): NodeInfo => {
    let info = nodes.get(ref.key);
    if (!info) {
      info = { key: ref.key, seq: seq++, first: ref, inputs: [] };
      nodes.set(ref.key, info);
      if (ref.key.length > MAX_KEY_LENGTH) report('INVALID_KEY', { key: ref.key }, ref.ident);
    }
    if (!ref.label) return info;
    if (info.def) {
      report('REDEFINED_NODE', { key: ref.key, firstLine: info.def.ident.line }, ref.ident);
      return info;
    }
    info.def = ref;
    if (ref.label.shape === 'square') {
      info.kind = 'ingredient';
      const parsed = parseIngredientLabel(ref.label, unitMap);
      const ingredient: Ingredient = { key: ref.key, name: parsed.name };
      if (parsed.quantity !== undefined) {
        if (!Number.isFinite(parsed.quantity) || parsed.quantity <= 0) {
          report('INVALID_QUANTITY', { quantity: parsed.quantityText ?? '' }, ref.label);
        } else {
          ingredient.quantity = parsed.quantity;
          if (parsed.unit !== undefined) ingredient.unit = parsed.unit;
        }
      }
      if (parsed.name === '') report('EMPTY_TEXT', {}, ref.label);
      info.ingredient = ingredient;
    } else {
      info.kind = 'step';
      info.text = ref.label.value.trim();
      if (info.text === '') report('EMPTY_TEXT', {}, ref.label);
    }
    return info;
  };

  for (const lexed of lines) {
    if (lexed.failed) {
      for (const token of lexed.tokens) if (token.type === 'ident') suppressed.add(token.value);
      continue;
    }
    const statement = parseStatement(lexed.tokens);
    if (!statement.ok) {
      report(statement.code, statement.params, statement.span);
      for (const token of lexed.tokens) if (token.type === 'ident') suppressed.add(token.value);
      continue;
    }
    if (statement.kind === 'empty') continue;
    if (statement.kind === 'before') {
      if (statement.token.text.trim() === '') report('EMPTY_TEXT', {}, statement.token);
      prerequisites.push(statement.token.text.trim());
      continue;
    }
    if (statement.kind === 'definition') {
      register(statement.node);
      continue;
    }
    // Edge statement: sources --> t1 --> t2 ...
    statement.sources.forEach(register);
    let previous = statement.sources;
    for (const target of statement.targets) {
      register(target);
      if (target.label?.shape === 'square') {
        report('INGREDIENT_AS_TARGET', { key: target.key }, target.span);
      } else {
        for (const from of previous) edges.push({ from, to: target });
      }
      previous = [target];
    }
    if (statement.fanOut) report('FAN_OUT', {}, statement.fanOut);
  }

  // --- resolution -------------------------------------------------------------------------
  for (const info of nodes.values()) {
    if (!info.def && !suppressed.has(info.key)) {
      report('UNDEFINED_NODE', { key: info.key }, info.first.ident);
    }
  }
  for (const edge of edges) {
    const from = nodes.get(edge.from.key)!;
    const to = nodes.get(edge.to.key)!;
    if (!from.def || !to.def) continue;
    if (to.kind === 'ingredient') {
      report('INGREDIENT_AS_TARGET', { key: to.key }, edge.to.span);
      continue;
    }
    if (from.consumer !== undefined) {
      report('MULTIPLE_CONSUMERS', { key: from.key, consumer: from.consumer }, edge.from.span);
      continue;
    }
    from.consumer = to.key;
    to.inputs.push(from.key);
  }

  const all = [...nodes.values()].filter((n) => n.def).sort((a, b) => a.seq - b.seq);
  const ingredients = all.filter((n) => n.kind === 'ingredient');
  const stepNodes = all.filter((n) => n.kind === 'step');
  const order = topologicalOrder(stepNodes, nodes);

  // --- tree rules ---------------------------------------------------------------------------
  const blocked = diagnostics.some((d) => BLOCKING.has(d.code));
  if (!blocked && stepNodes.length > 0) {
    for (const step of stepNodes) {
      if (step.inputs.length === 0) report('NO_INPUT', { key: step.key }, step.def!.span);
    }
    if (order.cyclic.length > 0) {
      const first = order.cyclic[0]!;
      report('CYCLE', { keys: order.cyclic.map((s) => s.key).join(', ') }, first.def!.span);
    }
    for (const ingredient of ingredients) {
      if (ingredient.consumer === undefined) {
        report('UNCONSUMED', { key: ingredient.key }, ingredient.def!.span);
      }
    }
    const roots = order.sorted.filter((s) => s.consumer === undefined);
    const root = roots[roots.length - 1];
    for (const extra of roots.slice(0, -1)) {
      report('MULTIPLE_ROOTS', { key: extra.key, root: root!.key }, extra.def!.span);
    }
  }

  const recipe: Recipe = {
    prerequisites,
    ingredients: ingredients.map((n) => n.ingredient!),
    steps: [...order.sorted, ...order.cyclic].map((n): Step => ({
      key: n.key,
      text: n.text!,
      inputs: n.inputs,
    })),
  };

  diagnostics.sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || (a.column ?? 0) - (b.column ?? 0));
  if (hasErrors(diagnostics)) {
    return { ok: false, diagnostics, partial: normalize(recipe, options) };
  }
  const normalized = normalize(recipe, options);
  // Safety net: the DSL checks above mirror validate(); anything left is a bug, but report it.
  const leftovers = validate(normalized, options).filter((d) => d.severity === 'error');
  if (leftovers.length > 0) return { ok: false, diagnostics: leftovers, partial: normalized };
  return { ok: true, recipe: normalized, diagnostics: [] };
}

/**
 * Stable topological order of steps: a step comes after the steps it consumes;
 * ties are broken by order of first mention. Steps on a cycle are returned apart.
 */
function topologicalOrder(steps: NodeInfo[], nodes: Map<string, NodeInfo>) {
  const pending = new Map<string, number>();
  for (const step of steps) {
    pending.set(step.key, step.inputs.filter((input) => nodes.get(input)?.kind === 'step').length);
  }
  const sorted: NodeInfo[] = [];
  const done = new Set<string>();
  // Steps are few (< 100): a simple repeated scan keeps the tie-breaking obvious.
  for (;;) {
    const next = steps.find((s) => !done.has(s.key) && pending.get(s.key) === 0);
    if (!next) break;
    done.add(next.key);
    sorted.push(next);
    if (next.consumer !== undefined && pending.has(next.consumer)) {
      pending.set(next.consumer, pending.get(next.consumer)! - 1);
    }
  }
  return { sorted, cyclic: steps.filter((s) => !done.has(s.key)) };
}

// --- statements -----------------------------------------------------------------------------

type Statement =
  | { ok: true; kind: 'empty' }
  | { ok: true; kind: 'before'; token: Extract<Token, { type: 'before' }> }
  | { ok: true; kind: 'definition'; node: NodeRef }
  | { ok: true; kind: 'edges'; sources: NodeRef[]; targets: NodeRef[]; fanOut?: Span }
  | { ok: false; code: DiagnosticCode; params: Record<string, string>; span: Span };

function found(token: Token | undefined): string {
  if (!token) return 'end of line';
  switch (token.type) {
    case 'ident':
      return `"${token.value}"`;
    case 'label':
      return token.shape === 'square' ? '"["' : '"("';
    case 'amp':
      return '"&"';
    case 'arrow':
      return '"-->"';
    case 'before':
      return '"before:"';
  }
}

/**
 * Grammar of one line (tokens already lexed):
 *
 *   statement  = before | definition | edges
 *   definition = node-def
 *   edges      = node ( "&" node )* ( "-->" node )+
 *   node       = IDENT [ LABEL ]
 */
function parseStatement(tokens: Token[]): Statement {
  if (tokens.length === 0) return { ok: true, kind: 'empty' };
  const first = tokens[0]!;
  if (first.type === 'before') return { ok: true, kind: 'before', token: first };

  let pos = 0;
  const lastSpan = tokens[tokens.length - 1]!;
  const eol: Span = {
    line: lastSpan.line,
    column: lastSpan.endColumn,
    endColumn: lastSpan.endColumn + 1,
  };
  const error = (expected: string): Statement => {
    const token = tokens[pos];
    return {
      ok: false,
      code: 'SYNTAX_ERROR',
      params: { expected, found: found(token) },
      span: token ?? eol,
    };
  };
  const readNode = (): NodeRef | undefined => {
    const ident = tokens[pos];
    if (ident?.type !== 'ident') return undefined;
    pos++;
    const label = tokens[pos];
    if (label?.type === 'label') {
      pos++;
      return {
        key: ident.value,
        ident,
        label,
        span: { line: ident.line, column: ident.column, endColumn: label.endColumn },
      };
    }
    return { key: ident.value, ident, span: ident };
  };

  const sources: NodeRef[] = [];
  const firstNode = readNode();
  if (!firstNode) return error('a node id');
  sources.push(firstNode);
  while (tokens[pos]?.type === 'amp') {
    pos++;
    const node = readNode();
    if (!node) return error('a node id after "&"');
    sources.push(node);
  }

  if (pos === tokens.length) {
    if (sources.length === 1 && firstNode.label)
      return { ok: true, kind: 'definition', node: firstNode };
    return error(sources.length === 1 ? '"[", "(" or "-->"' : '"-->"');
  }

  const targets: NodeRef[] = [];
  while (tokens[pos]?.type === 'arrow') {
    pos++;
    const node = readNode();
    if (!node) return error('a step after "-->"');
    targets.push(node);
  }
  if (targets.length === 0) return error('"&" or "-->"');
  if (pos === tokens.length) return { ok: true, kind: 'edges', sources, targets };
  const extra = tokens[pos]!;
  if (extra.type === 'amp') return { ok: true, kind: 'edges', sources, targets, fanOut: extra };
  return error('"-->" or end of line');
}
