/**
 * Self-check of a calculation trace.
 *
 * Two kinds of mistakes can make a trace misleading, and both are caught here
 * without any knowledge of the engine:
 * 1. A step's documented `expr` does not reproduce its recorded `output` from
 *    its recorded inputs (the formula text and the code have drifted apart).
 * 2. An input's `from` does not match where it claims to come from: a
 *    `step:` input differs from that step's output, a `profile:` input
 *    differs from the saved inputs, or a `const:` input differs from the
 *    constants snapshot.
 *
 * `derived:` inputs, and constants that are not plain values, cannot be
 * checked mechanically; they are counted as skipped so the report is honest
 * about what was verified.
 */

import type { TraceLog, TraceScalar, TraceStep } from "./trace";

// ---------------------------------------------------------------------------
// A small expression evaluator: numbers, names, + - * / ^, parentheses and a
// few functions. No access to anything else, so a trace file can never run code.
// ---------------------------------------------------------------------------

type Token =
  | { type: "num"; value: number }
  | { type: "name"; value: string }
  | { type: "op"; value: string };

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  min: Math.min,
  max: Math.max,
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  sqrt: Math.sqrt,
  pow: Math.pow,
};

const hasOwn = (record: object, key: string): boolean => Object.prototype.hasOwnProperty.call(record, key);

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /\s*(?:(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+)|([A-Za-z_]\w*)|([-+*/^(),]))/giy;
  let position = 0;
  while (position < source.length) {
    pattern.lastIndex = position;
    const match = pattern.exec(source);
    if (!match) {
      if (source.slice(position).trim() === "") break;
      throw new Error(`Unexpected character at ${position} in "${source}"`);
    }
    position = pattern.lastIndex;
    if (match[1] !== undefined) tokens.push({ type: "num", value: Number(match[1]) });
    else if (match[2] !== undefined) tokens.push({ type: "name", value: match[2] });
    else tokens.push({ type: "op", value: match[3] });
  }
  return tokens;
}

/** Evaluates `expr` with the given numeric variables. Throws on any syntax or name error. */
export function evaluateExpression(expr: string, variables: Record<string, number>): number {
  const tokens = tokenize(expr);
  let index = 0;

  const peek = (): Token | undefined => tokens[index];
  const isOp = (value: string): boolean => {
    const token = peek();
    return token?.type === "op" && token.value === value;
  };
  const expectOp = (value: string): void => {
    if (!isOp(value)) throw new Error(`Expected "${value}" in "${expr}"`);
    index += 1;
  };

  // expression := term (('+' | '-') term)*
  const parseExpression = (): number => {
    let value = parseTerm();
    while (isOp("+") || isOp("-")) {
      const op = (tokens[index++] as { value: string }).value;
      const right = parseTerm();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  };

  // term := unary (('*' | '/') unary)*
  const parseTerm = (): number => {
    let value = parseUnary();
    while (isOp("*") || isOp("/")) {
      const op = (tokens[index++] as { value: string }).value;
      const right = parseUnary();
      value = op === "*" ? value * right : value / right;
    }
    return value;
  };

  // unary := ('-' | '+') unary | power. Unary minus binds looser than '^': -a^b = -(a^b).
  const parseUnary = (): number => {
    if (isOp("-")) {
      index += 1;
      return -parseUnary();
    }
    if (isOp("+")) {
      index += 1;
      return parseUnary();
    }
    return parsePower();
  };

  // power := primary ('^' unary)?   (right-associative)
  const parsePower = (): number => {
    const base = parsePrimary();
    if (isOp("^")) {
      index += 1;
      return Math.pow(base, parseUnary());
    }
    return base;
  };

  const parsePrimary = (): number => {
    const token = tokens[index++];
    if (!token) throw new Error(`Unexpected end of "${expr}"`);
    if (token.type === "num") return token.value;
    if (token.type === "op") {
      if (token.value === "(") {
        const value = parseExpression();
        expectOp(")");
        return value;
      }
      throw new Error(`Unexpected "${token.value}" in "${expr}"`);
    }
    if (isOp("(")) {
      const fn = hasOwn(FUNCTIONS, token.value) ? FUNCTIONS[token.value] : undefined;
      if (!fn) throw new Error(`Unknown function "${token.value}" in "${expr}"`);
      index += 1;
      const args: number[] = [];
      if (!isOp(")")) {
        args.push(parseExpression());
        while (isOp(",")) {
          index += 1;
          args.push(parseExpression());
        }
      }
      expectOp(")");
      return fn(...args);
    }
    if (!hasOwn(variables, token.value)) {
      throw new Error(`Unknown name "${token.value}" in "${expr}"`);
    }
    return variables[token.value];
  };

  const result = parseExpression();
  if (index < tokens.length) throw new Error(`Unexpected trailing input in "${expr}"`);
  return result;
}

// ---------------------------------------------------------------------------
// Path lookup in the saved inputs and in the constants snapshot
// ---------------------------------------------------------------------------

const MISSING = Symbol("missing");

/**
 * Resolves `a.b[id=X].c` against nested objects and arrays. `[id=X]` picks the
 * array element whose `id` is X. Returns MISSING when any step is absent.
 */
export function resolvePath(root: unknown, path: string): unknown {
  let current: unknown = root;
  const pattern = /([^.[\]]+)|\[id=([^\]]+)\]/g;
  for (const match of path.matchAll(pattern)) {
    if (current === null || current === undefined) return MISSING;
    if (match[2] !== undefined) {
      if (!Array.isArray(current)) return MISSING;
      const found = current.find(
        (item) => typeof item === "object" && item !== null && (item as { id?: unknown }).id === match[2],
      );
      if (found === undefined) return MISSING;
      current = found;
    } else {
      if (typeof current !== "object") return MISSING;
      const record = current as Record<string, unknown>;
      if (!hasOwn(record, match[1])) return MISSING;
      current = record[match[1]];
    }
  }
  return current;
}

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

export type TraceIssueKind =
  | "expr-mismatch"
  | "expr-error"
  | "step-missing"
  | "step-order"
  | "step-mismatch"
  | "profile-missing"
  | "profile-mismatch"
  | "const-missing"
  | "const-mismatch";

export interface TraceIssue {
  stepId: string;
  kind: TraceIssueKind;
  message: string;
}

export interface TraceCheckResult {
  stepsTotal: number;
  /** Steps whose `expr` was re-evaluated and matched (or failed, see `issues`). */
  exprChecked: number;
  /** Steps with no `expr`: documentation only. */
  exprAbsent: number;
  provenanceChecked: number;
  /** `derived:` inputs and constants that are not plain values. */
  provenanceSkipped: number;
  issues: TraceIssue[];
}

export interface TraceCheckContext {
  /** The saved inputs, or the redacted projection of them in a pack. */
  profile?: unknown;
  /** Constants by name, for example `{ TAX_RATES: {...}, DEFAULT_CURRENT_AGE: 30 }`. */
  constants?: Record<string, unknown>;
}

const TOLERANCE = 1e-9;

function sameScalar(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") {
    return Math.abs(a - b) <= TOLERANCE * Math.max(1, Math.abs(a), Math.abs(b));
  }
  return a === b;
}

function toNumber(value: TraceScalar): number | null {
  if (value === null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  return null;
}

function checkExpression(step: TraceStep, issues: TraceIssue[]): void {
  const variables: Record<string, number> = {};
  for (const [name, entry] of Object.entries(step.inputs)) {
    const numeric = toNumber(entry.value);
    if (numeric !== null) variables[name] = numeric;
  }
  try {
    const value = evaluateExpression(step.expr as string, variables);
    const output = toNumber(step.output);
    if (output === null || !sameScalar(value, output)) {
      issues.push({
        stepId: step.id,
        kind: "expr-mismatch",
        message: `"${step.expr}" gives ${value}, recorded output is ${String(step.output)}`,
      });
    }
  } catch (error) {
    issues.push({
      stepId: step.id,
      kind: "expr-error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Re-checks every step's expression and every input's provenance. */
export function checkTrace(log: TraceLog, context: TraceCheckContext = {}): TraceCheckResult {
  const issues: TraceIssue[] = [];
  const indexById = new Map<string, number>();
  log.steps.forEach((step, index) => indexById.set(step.id, index));

  let exprChecked = 0;
  let exprAbsent = 0;
  let provenanceChecked = 0;
  let provenanceSkipped = 0;

  log.steps.forEach((step, stepIndex) => {
    if (step.expr) {
      exprChecked += 1;
      checkExpression(step, issues);
    } else {
      exprAbsent += 1;
    }

    for (const [name, entry] of Object.entries(step.inputs)) {
      const colon = entry.from.indexOf(":");
      const kind = colon < 0 ? "" : entry.from.slice(0, colon);
      const target = colon < 0 ? "" : entry.from.slice(colon + 1);

      if (kind === "step") {
        provenanceChecked += 1;
        const referencedIndex = indexById.get(target);
        if (referencedIndex === undefined) {
          issues.push({ stepId: step.id, kind: "step-missing", message: `input "${name}" refers to unknown step "${target}"` });
        } else if (referencedIndex >= stepIndex) {
          issues.push({ stepId: step.id, kind: "step-order", message: `input "${name}" refers to "${target}", which is not recorded earlier` });
        } else if (!sameScalar(log.steps[referencedIndex].output, entry.value)) {
          issues.push({
            stepId: step.id,
            kind: "step-mismatch",
            message: `input "${name}" is ${String(entry.value)} but step "${target}" output ${String(log.steps[referencedIndex].output)}`,
          });
        }
      } else if (kind === "profile") {
        if (context.profile === undefined) {
          provenanceSkipped += 1;
          continue;
        }
        provenanceChecked += 1;
        const actual = resolvePath(context.profile, target);
        if (actual === MISSING) {
          issues.push({ stepId: step.id, kind: "profile-missing", message: `input "${name}": no field at "${target}"` });
        } else if (!sameScalar(actual, entry.value)) {
          issues.push({
            stepId: step.id,
            kind: "profile-mismatch",
            message: `input "${name}" is ${String(entry.value)} but "${target}" holds ${String(actual)}`,
          });
        }
      } else if (kind === "const") {
        if (!context.constants) {
          provenanceSkipped += 1;
          continue;
        }
        const actual = resolvePath(context.constants, target);
        if (actual === MISSING) {
          issues.push({ stepId: step.id, kind: "const-missing", message: `input "${name}": no constant at "${target}"` });
          continue;
        }
        if (typeof actual === "object" && actual !== null) {
          provenanceSkipped += 1;
          continue;
        }
        provenanceChecked += 1;
        if (!sameScalar(actual, entry.value)) {
          issues.push({
            stepId: step.id,
            kind: "const-mismatch",
            message: `input "${name}" is ${String(entry.value)} but constant "${target}" is ${String(actual)}`,
          });
        }
      } else {
        provenanceSkipped += 1;
      }
    }
  });

  return {
    stepsTotal: log.steps.length,
    exprChecked,
    exprAbsent,
    provenanceChecked,
    provenanceSkipped,
    issues,
  };
}
