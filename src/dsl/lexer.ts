import { diagnostic, type Diagnostic } from '../diagnostics';
import { QUANTITY_SOURCE } from '../quantity';

/** Position of a token on its line. Columns are 1-based UTF-16 offsets, `endColumn` exclusive. */
export interface Span {
  line: number;
  column: number;
  endColumn: number;
}

export interface IdentToken extends Span {
  type: 'ident';
  value: string;
}

export interface LabelToken extends Span {
  type: 'label';
  /** `square` = `[ingredient]`, `round` = `(step)`. */
  shape: 'square' | 'round';
  /** Label text: raw content between the delimiters, or the unescaped quoted string. */
  value: string;
  quoted: boolean;
  /** Square labels only: the `quantity [unit]` written before a quoted name (may be ''). */
  prefix: string;
}

export interface PunctToken extends Span {
  type: 'amp' | 'arrow';
}

export interface BeforeToken extends Span {
  type: 'before';
  text: string;
  quoted: boolean;
}

export type Token = IdentToken | LabelToken | PunctToken | BeforeToken;

export interface LexedLine {
  line: number;
  tokens: Token[];
  /** True when the line has a lexical error; its tokens are then incomplete. */
  failed: boolean;
}

export interface LexResult {
  lines: LexedLine[];
  diagnostics: Diagnostic[];
}

const IDENT_CHAR = /[A-Za-z0-9_-]/;
const CLOSE = { square: ']', round: ')' } as const;
const OPEN = { square: '[', round: '(' } as const;

/** Splits a document into lines (`\n`, `\r\n` or `\r`). */
export function splitLines(source: string): string[] {
  return source.split(/\r\n|\r|\n/);
}

/**
 * Tokenizes a whole document, line by line. Comments (`%%` outside labels and
 * quoted strings) and blank lines produce no tokens. A lexical error stops
 * the current line (marked `failed`) but not the following ones.
 *
 * @param units lower-cased unit vocabulary, used to recognise `[2 kg "quoted name"]`.
 */
export function lex(source: string, units: ReadonlySet<string>): LexResult {
  const diagnostics: Diagnostic[] = [];
  const lines = splitLines(source).map((text, i) => lexLine(text, i + 1, units, diagnostics));
  return { lines, diagnostics };
}

export function lexLine(
  text: string,
  line: number,
  units: ReadonlySet<string>,
  diagnostics: Diagnostic[],
): LexedLine {
  const tokens: Token[] = [];
  let pos = 0;
  const at = (offset = 0) => text[pos + offset] ?? '';
  const fail = (
    code: Parameters<typeof diagnostic>[0],
    params: Record<string, string>,
    start: number,
    end: number,
  ) => {
    diagnostics.push(
      diagnostic(code, params, { line, column: start + 1, endLine: line, endColumn: end + 1 }),
    );
    return { line, tokens, failed: true };
  };
  const skipSpaces = () => {
    while (pos < text.length && /\s/.test(at())) pos++;
  };

  skipSpaces();

  // `before: text` statement (only at the start of a line).
  const beforeMatch = /^before\s*:/.exec(text.slice(pos));
  if (beforeMatch) {
    const start = pos;
    pos += beforeMatch[0].length;
    skipSpaces();
    if (at() === '"') {
      const quoted = readQuoted(text, pos);
      if (!quoted.ok) return fail('UNTERMINATED_STRING', {}, pos, text.length);
      pos = quoted.end;
      skipSpaces();
      if (pos < text.length && !text.startsWith('%%', pos)) {
        return fail(
          'SYNTAX_ERROR',
          { expected: 'end of line', found: describe(text, pos) },
          pos,
          pos + 1,
        );
      }
      tokens.push({
        type: 'before',
        text: quoted.value,
        quoted: true,
        line,
        column: start + 1,
        endColumn: quoted.end + 1,
      });
    } else {
      const comment = text.indexOf('%%', pos);
      const end = comment === -1 ? text.length : comment;
      tokens.push({
        type: 'before',
        text: text.slice(pos, end).trim(),
        quoted: false,
        line,
        column: start + 1,
        endColumn: end + 1,
      });
    }
    return { line, tokens, failed: false };
  }

  while (pos < text.length) {
    skipSpaces();
    if (pos >= text.length) break;
    const start = pos;
    const ch = at();

    if (text.startsWith('%%', pos)) break; // comment until end of line
    if (text.startsWith('-->', pos)) {
      pos += 3;
      tokens.push({ type: 'arrow', line, column: start + 1, endColumn: pos + 1 });
      continue;
    }
    if (ch === '&') {
      pos++;
      tokens.push({ type: 'amp', line, column: start + 1, endColumn: pos + 1 });
      continue;
    }
    if (IDENT_CHAR.test(ch)) {
      while (pos < text.length && IDENT_CHAR.test(at()) && !text.startsWith('-->', pos)) pos++;
      tokens.push({
        type: 'ident',
        value: text.slice(start, pos),
        line,
        column: start + 1,
        endColumn: pos + 1,
      });
      continue;
    }
    if (ch === '[' || ch === '(') {
      const shape = ch === '[' ? 'square' : 'round';
      const label = readLabel(text, pos, shape, units);
      if (!label.ok) return fail(label.code, label.params, label.start, label.end);
      pos = label.end;
      tokens.push({
        type: 'label',
        shape,
        value: label.value,
        quoted: label.quoted,
        prefix: label.prefix,
        line,
        column: start + 1,
        endColumn: pos + 1,
      });
      continue;
    }
    return fail(
      'SYNTAX_ERROR',
      { expected: 'a node, "&" or "-->"', found: describe(text, pos) },
      pos,
      pos + 1,
    );
  }
  return { line, tokens, failed: false };
}

/** Human description of the character at `pos`, for SYNTAX_ERROR's `found` param. */
export function describe(text: string, pos: number): string {
  if (pos >= text.length) return 'end of line';
  return `"${String.fromCodePoint(text.codePointAt(pos) ?? 0)}"`;
}

type QuotedResult = { ok: true; value: string; end: number } | { ok: false };

/** Reads a `"…"` string starting at `start` (which must be `"`). Escapes: `\"` and `\\`. */
export function readQuoted(text: string, start: number): QuotedResult {
  let value = '';
  let pos = start + 1;
  while (pos < text.length) {
    const ch = text[pos]!;
    if (ch === '\\' && (text[pos + 1] === '"' || text[pos + 1] === '\\')) {
      value += text[pos + 1];
      pos += 2;
      continue;
    }
    if (ch === '"') return { ok: true, value, end: pos + 1 };
    value += ch;
    pos++;
  }
  return { ok: false };
}

type LabelResult =
  | { ok: true; value: string; quoted: boolean; prefix: string; end: number }
  | {
      ok: false;
      code: 'UNTERMINATED_LABEL' | 'UNTERMINATED_STRING' | 'SYNTAX_ERROR';
      params: Record<string, string>;
      start: number;
      end: number;
    };

const QUOTE_PREFIX_SOURCE = String.raw`^\s*(?:(?:${QUANTITY_SOURCE})(?:\s*([^\s"\[\]()]+))?\s*)?$`;
const QUOTE_PREFIX = new RegExp(QUOTE_PREFIX_SOURCE);

/**
 * Reads a label starting at the opening delimiter.
 *
 * - Unquoted: everything up to the matching closing delimiter; only the label's
 *   own delimiter kind is counted for nesting (`[Ail (gousse)]`, `(Mix (well))`).
 * - Quoted: `("text")`, `["name"]`, or for ingredients `[qty unit "name"]` —
 *   a `"` opens a quoted string when it is the first non-blank character, or
 *   (square labels) when everything before it is a quantity optionally
 *   followed by a known unit. Any other `"` is a literal character.
 */
function readLabel(
  text: string,
  start: number,
  shape: 'square' | 'round',
  units: ReadonlySet<string>,
): LabelResult {
  const open = OPEN[shape];
  const close = CLOSE[shape];
  let depth = 0;
  let pos = start + 1;
  while (pos < text.length) {
    const ch = text[pos]!;
    if (ch === '"') {
      const before = text.slice(start + 1, pos);
      const opensQuote =
        before.trim() === '' ||
        (shape === 'square' && depth === 0 && isQuantityPrefix(before, units));
      if (opensQuote) {
        const quoted = readQuoted(text, pos);
        if (!quoted.ok) {
          return {
            ok: false,
            code: 'UNTERMINATED_STRING',
            params: {},
            start: pos,
            end: text.length,
          };
        }
        let end = quoted.end;
        while (end < text.length && /\s/.test(text[end]!)) end++;
        if (text[end] !== close) {
          return {
            ok: false,
            code: 'SYNTAX_ERROR',
            params: { expected: `"${close}"`, found: describe(text, end) },
            start: end,
            end: end + 1,
          };
        }
        return { ok: true, value: quoted.value, quoted: true, prefix: before.trim(), end: end + 1 };
      }
    }
    if (ch === open) depth++;
    if (ch === close) {
      if (depth === 0) {
        return {
          ok: true,
          value: text.slice(start + 1, pos),
          quoted: false,
          prefix: '',
          end: pos + 1,
        };
      }
      depth--;
    }
    pos++;
  }
  return { ok: false, code: 'UNTERMINATED_LABEL', params: { close }, start, end: text.length };
}

function isQuantityPrefix(before: string, units: ReadonlySet<string>): boolean {
  const match = QUOTE_PREFIX.exec(before);
  if (!match || before.trim() === '') return false;
  return match[1] === undefined || units.has(match[1].toLowerCase());
}
