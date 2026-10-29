/**
 * Calculation trace.
 *
 * The engine is a set of pure functions. To let an independent reviewer (a
 * person, or an AI session working offline) re-check a result, selected
 * functions record the steps they take: a title, the formula in words, an
 * optional machine-checkable expression, the named inputs (each with where it
 * came from) and the output.
 *
 * Tracing is switched on only inside `runTraced`. Outside it every call here is
 * a null check, and the `build` callbacks are never run, so the engine's
 * results and cost are unchanged. Results with tracing on and off must be
 * identical; `trace.test.ts` and the pipeline tests pin that.
 *
 * Design note: the active trace lives in a module-level variable instead of
 * being passed as a parameter. The engine is synchronous, so there is no
 * interleaving, and this avoids changing the signature of every function on
 * the call path.
 */

export type TraceScalar = number | string | boolean | null;

/**
 * Where an input value came from, so a reviewer can trace it back:
 * - `profile:<path>`  a field of the saved inputs, for example
 *   `profile:pensionSavings.accounts[id=ACCOUNT].totalAccumulatedBalance`
 * - `step:<id>`       the output of an earlier step
 * - `const:<NAME>`    a constant, for example `const:TAX_RATES.capitalGainsRate`
 * - `derived:<text>`  something computed on the spot that is not worth a step
 */
export type TraceSource = string;

export interface TraceInput {
  value: TraceScalar;
  from: TraceSource;
}

export interface TraceStep {
  /** Unique within one trace: the scope path plus the local id. */
  id: string;
  title: string;
  /** The formula in words or symbols, for a human reader. */
  formula: string;
  /**
   * Optional expression over the input names that the self-check evaluates and
   * compares with `output`. Supports + - * / ^, parentheses, numbers, input
   * names and min/max/abs/floor/ceil/round/pow/sqrt. Leave it out when a step
   * is not a simple formula; the step is then documentation only.
   */
  expr?: string;
  inputs: Record<string, TraceInput>;
  output: TraceScalar;
  note?: string;
}

export interface TraceTable {
  id: string;
  title: string;
  columns: string[];
  rows: TraceScalar[][];
  note?: string;
}

export interface TraceLog {
  /** ISO timestamp the run treated as "now". */
  evaluatedAt: string;
  steps: TraceStep[];
  tables: TraceTable[];
}

export type TraceStepBody = Omit<TraceStep, "id">;
export type TraceTableBody = Omit<TraceTable, "id">;

export type TraceMember = "self" | "spouse";

interface ActiveTrace {
  evaluatedAt: Date;
  steps: TraceStep[];
  tables: TraceTable[];
  scope: string[];
  usedIds: Set<string>;
  member: TraceMember;
}

let active: ActiveTrace | null = null;
let clockOverride: Date | null = null;

/** True only inside `runTraced`. Guard expensive trace-only work with it. */
export function isTracing(): boolean {
  return active !== null;
}

/**
 * The engine's notion of "now". While tracing it is the recorded
 * `evaluatedAt`, so a replay of the same inputs gives the same numbers.
 */
export function engineNowMs(): number {
  if (active) return active.evaluatedAt.getTime();
  return clockOverride ? clockOverride.getTime() : Date.now();
}

/**
 * Runs `fn` with the engine's clock fixed at `at`, without tracing. Lets the
 * untraced calculations of a verification pack use the same "now" as the
 * traced one.
 */
export function withEngineClock<T>(at: Date, fn: () => T): T {
  const previous = clockOverride;
  clockOverride = at;
  try {
    return fn();
  } finally {
    clockOverride = previous;
  }
}

export function engineCurrentYear(): number {
  return new Date(engineNowMs()).getFullYear();
}

export interface RunTracedOptions {
  /** Defaults to the current time. */
  evaluatedAt?: Date;
}

/** Runs `fn` with tracing on and returns its result together with the trace. */
export function runTraced<T>(
  fn: () => T,
  options: RunTracedOptions = {},
): { result: T; log: TraceLog } {
  const previous = active;
  const current: ActiveTrace = {
    evaluatedAt: options.evaluatedAt ?? new Date(),
    steps: [],
    tables: [],
    scope: [],
    usedIds: new Set(),
    member: "self",
  };
  active = current;
  try {
    const result = fn();
    return {
      result,
      log: {
        evaluatedAt: current.evaluatedAt.toISOString(),
        steps: current.steps,
        tables: current.tables,
      },
    };
  } finally {
    active = previous;
  }
}

/** Runs `fn` with `name` appended to the id path. A no-op when not tracing. */
export function withScope<T>(name: string, fn: () => T): T {
  const trace = active;
  if (!trace) return fn();
  trace.scope.push(name);
  try {
    return fn();
  } finally {
    trace.scope.pop();
  }
}

/**
 * Runs `fn` for one household member: the scope is the member's name, and
 * `fromProfile` paths written for the member's single-person view are mapped
 * back to the real field (the spouse's age is `spouse.age`, not `personal.age`).
 */
export function withMember<T>(member: TraceMember, fn: () => T): T {
  const trace = active;
  if (!trace) return fn();
  const previous = trace.member;
  trace.member = member;
  try {
    return withScope(member, fn);
  } finally {
    trace.member = previous;
  }
}

/** The full id a step recorded now with `localId` would get. */
export function traceId(localId: string): string {
  const trace = active;
  if (!trace) return localId;
  return [...trace.scope, localId].join("/");
}

function uniqueId(trace: ActiveTrace, localId: string): string {
  const base = [...trace.scope, localId].join("/");
  let id = base;
  let n = 2;
  while (trace.usedIds.has(id)) {
    id = `${base}#${n}`;
    n += 1;
  }
  trace.usedIds.add(id);
  return id;
}

function scalar(value: TraceScalar): TraceScalar {
  if (typeof value === "number" && !Number.isFinite(value)) {
    return Number.isNaN(value) ? "NaN" : value > 0 ? "Infinity" : "-Infinity";
  }
  return value;
}

/**
 * Records a step. `build` runs only when tracing. Returns the step's full id
 * (use it in a later step's `step:` source), or "" when not tracing.
 */
export function recordStep(localId: string, build: () => TraceStepBody): string {
  const trace = active;
  if (!trace) return "";
  const id = uniqueId(trace, localId);
  const body = build();
  const inputs: Record<string, TraceInput> = {};
  for (const [name, input] of Object.entries(body.inputs)) {
    inputs[name] = { value: scalar(input.value), from: input.from };
  }
  trace.steps.push({ id, ...body, inputs, output: scalar(body.output) });
  return id;
}

/** Records a table of rows (year-by-year data and the like). */
export function recordTable(localId: string, build: () => TraceTableBody): string {
  const trace = active;
  if (!trace) return "";
  const id = uniqueId(trace, localId);
  const body = build();
  trace.tables.push({
    id,
    ...body,
    rows: body.rows.map((row) => row.map(scalar)),
  });
  return id;
}

/** Shorthand for building an input entry. */
export function input(value: TraceScalar, from: TraceSource): TraceInput {
  return { value, from };
}

/** Fields the spouse's single-person view copies from `spouse.*` into `personal.*`. */
const SPOUSE_VIEW_PERSONAL_FIELDS = new Set([
  "age",
  "gender",
  "retirementAge",
  "monthlyGrossSalary",
  "creditPoints",
]);

/**
 * A field of the saved inputs. Inside `withMember("spouse", ...)` the path is
 * the one used in the spouse's view of the profile and is mapped to the real
 * location.
 */
export function fromProfile(path: string): TraceSource {
  if (active?.member === "spouse") {
    const personal = /^personal\.(\w+)(.*)$/.exec(path);
    if (personal && SPOUSE_VIEW_PERSONAL_FIELDS.has(personal[1])) {
      return `profile:spouse.${personal[1]}${personal[2]}`;
    }
    if (path === "bituachLeumi" || path.startsWith("bituachLeumi.")) {
      return `profile:spouse.${path}`;
    }
    if (path === "pensionSavings.otherAssets") {
      return fromDerived("the spouse's view has no other assets; they stay with the primary user");
    }
  }
  return `profile:${path}`;
}
export const fromStep = (id: string): TraceSource => `step:${id}`;

/**
 * The most recently recorded step whose id is `baseId` (an absolute id, scope
 * path included; a repeat of it carries a `#n` suffix). Lets a later module
 * point at an earlier module's step without passing ids around. Falls back to
 * a `derived:` note when no such step exists, or, when `expectedOutput` is
 * given, when the latest such step holds a different value, so a reader sees
 * the gap instead of a wrong link.
 */
export function fromLatestStep(baseId: string, expectedOutput?: TraceScalar): TraceSource {
  const trace = active;
  if (trace) {
    for (let index = trace.steps.length - 1; index >= 0; index -= 1) {
      const step = trace.steps[index];
      if (step.id === baseId || step.id.startsWith(`${baseId}#`)) {
        if (expectedOutput !== undefined && step.output !== scalar(expectedOutput)) {
          return fromDerived(`step "${baseId}" holds a different value`);
        }
        return `step:${step.id}`;
      }
    }
  }
  return fromDerived(`step "${baseId}" was not recorded`);
}
export const fromConst = (name: string): TraceSource => `const:${name}`;
export const fromDerived = (text: string): TraceSource => `derived:${text}`;
