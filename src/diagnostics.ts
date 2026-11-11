/**
 * Diagnostics are language-neutral: `code` + `params` identify the problem,
 * `message` is an English default. Consumers translate by providing their own
 * templates to {@link formatDiagnostic}.
 */
export const DIAGNOSTIC_CODES = [
  // --- DSL syntax ---
  'SYNTAX_ERROR',
  'UNTERMINATED_STRING',
  'UNTERMINATED_LABEL',
  'FAN_OUT',
  // --- DSL references ---
  'UNDEFINED_NODE',
  'REDEFINED_NODE',
  'INGREDIENT_AS_TARGET',
  'CYCLE',
  // --- JSON model ---
  'INVALID_SHAPE',
  'UNKNOWN_REFERENCE',
  'FORWARD_REFERENCE',
  // --- shared ---
  'INVALID_KEY',
  'DUPLICATE_KEY',
  'EMPTY_TEXT',
  'INVALID_QUANTITY',
  'UNIT_WITHOUT_QUANTITY',
  'UNKNOWN_UNIT',
  // --- tree rules ---
  'NO_INPUT',
  'MULTIPLE_CONSUMERS',
  'UNCONSUMED',
  'MULTIPLE_ROOTS',
] as const;

export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];

export type Severity = 'error' | 'warning';

export type DiagnosticParams = Record<string, string | number>;

export interface Diagnostic {
  code: DiagnosticCode;
  /** English default message, built from {@link DIAGNOSTIC_MESSAGES}. */
  message: string;
  severity: Severity;
  /** 1-based. DSL diagnostics only. */
  line?: number;
  /** 1-based, in UTF-16 code units (same as JS string indices / CodeMirror). */
  column?: number;
  endLine?: number;
  /** 1-based, exclusive. */
  endColumn?: number;
  /** JSON path of the offending value. Model (JSON) diagnostics only. */
  path?: (string | number)[];
  params?: DiagnosticParams;
}

/**
 * English message templates. `{name}` placeholders are replaced by `params.name`.
 * Copy this object, translate the values and pass it to {@link formatDiagnostic}.
 */
export const DIAGNOSTIC_MESSAGES: Record<DiagnosticCode, string> = {
  SYNTAX_ERROR: 'Syntax error: expected {expected}, found {found}.',
  UNTERMINATED_STRING: 'Unterminated quoted string.',
  UNTERMINATED_LABEL: 'Missing closing "{close}".',
  FAN_OUT: 'A node can only feed one step: "&" is not allowed after "-->".',
  UNDEFINED_NODE: 'Node "{key}" is used but never defined.',
  REDEFINED_NODE: 'Node "{key}" is already defined on line {firstLine}.',
  INGREDIENT_AS_TARGET: 'Ingredient "{key}" cannot be the target of "-->"; only steps can.',
  CYCLE: 'Steps form a cycle: {keys}.',
  INVALID_SHAPE: 'Invalid value: expected {expected}.',
  UNKNOWN_REFERENCE: 'Input "{key}" does not match any ingredient or step.',
  FORWARD_REFERENCE: 'Input "{key}" refers to a step that does not come before "{step}".',
  INVALID_KEY: 'Invalid key "{key}": use 1 to 40 letters, digits, "_" or "-".',
  DUPLICATE_KEY: 'Key "{key}" is used more than once.',
  EMPTY_TEXT: 'Text must not be empty.',
  INVALID_QUANTITY: 'Invalid quantity "{quantity}": it must be a number greater than 0.',
  UNIT_WITHOUT_QUANTITY: 'Unit "{unit}" is set without a quantity.',
  UNKNOWN_UNIT: 'Unknown unit "{unit}".',
  NO_INPUT: 'Step "{key}" has no input.',
  MULTIPLE_CONSUMERS:
    '"{key}" is already used by step "{consumer}"; each node feeds exactly one step.',
  UNCONSUMED: 'Ingredient "{key}" is not used by any step.',
  MULTIPLE_ROOTS:
    'Step "{key}" is not used by any later step; only the final step "{root}" may be unused.',
};

/** Replaces `{name}` placeholders of `template` with `params`. Unknown placeholders are kept. */
export function interpolate(template: string, params: DiagnosticParams = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

/** Formats a diagnostic with custom (e.g. translated) templates, falling back to English. */
export function formatDiagnostic(
  diagnostic: Pick<Diagnostic, 'code' | 'params'>,
  templates: Partial<Record<DiagnosticCode, string>> = DIAGNOSTIC_MESSAGES,
): string {
  const template = templates[diagnostic.code] ?? DIAGNOSTIC_MESSAGES[diagnostic.code];
  return interpolate(template, diagnostic.params);
}

/** Internal helper to build a diagnostic with its English message. */
export function diagnostic(
  code: DiagnosticCode,
  params: DiagnosticParams,
  location: Omit<Diagnostic, 'code' | 'message' | 'severity' | 'params'> = {},
  severity: Severity = 'error',
): Diagnostic {
  return {
    code,
    message: interpolate(DIAGNOSTIC_MESSAGES[code], params),
    severity,
    ...location,
    params,
  };
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === 'error');
}
