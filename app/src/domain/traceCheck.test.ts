import { describe, expect, it } from "vitest";

import type { TraceLog, TraceStep } from "./trace";
import { checkTrace, evaluateExpression, resolvePath } from "./traceCheck";

describe("evaluateExpression", () => {
  const evaluate = (expr: string, vars: Record<string, number> = {}) => evaluateExpression(expr, vars);

  it("follows operator precedence", () => {
    expect(evaluate("2 + 3 * 4")).toBe(14);
    expect(evaluate("(2 + 3) * 4")).toBe(20);
    expect(evaluate("10 - 4 - 3")).toBe(3);
    expect(evaluate("100 / 5 / 2")).toBe(10);
  });

  it("treats ^ as right-associative and tighter than unary minus", () => {
    expect(evaluate("2 ^ 3 ^ 2")).toBe(512);
    expect(evaluate("-2 ^ 2")).toBe(-4);
    expect(evaluate("2 ^ -1")).toBe(0.5);
    expect(evaluate("-(2 + 3)")).toBe(-5);
  });

  it("reads numbers with decimals and exponents", () => {
    expect(evaluate("1.5 + .5")).toBe(2);
    expect(evaluate("1e3 + 2.5e-1")).toBe(1000.25);
  });

  it("uses variables and the supported functions", () => {
    expect(evaluate("a * (1 + r) ^ n", { a: 100, r: 0.1, n: 2 })).toBeCloseTo(121, 10);
    expect(evaluate("min(3, 1, 2) + max(4, 9) + abs(-2)")).toBe(12);
    expect(evaluate("round(2.5) + floor(2.9) + ceil(2.1) + sqrt(16) + pow(2, 3)")).toBe(3 + 2 + 3 + 4 + 8);
  });

  it("rejects anything outside the grammar", () => {
    expect(() => evaluate("missing + 1")).toThrow(/Unknown name/);
    expect(() => evaluate("eval(1)")).toThrow(/Unknown function/);
    expect(() => evaluate("1 +")).toThrow(/Unexpected end/);
    expect(() => evaluate("(1 + 2")).toThrow(/Expected "\)"/);
    expect(() => evaluate("1 2")).toThrow(/trailing/);
    expect(() => evaluate("1 $ 2")).toThrow(/Unexpected character/);
    expect(() => evaluate("constructor")).toThrow(/Unknown name/);
    expect(() => evaluate("constructor(1)")).toThrow(/Unknown function/);
    expect(() => evaluate("toString + 1")).toThrow(/Unknown name/);
  });
});

describe("resolvePath", () => {
  const root = {
    a: { b: [{ id: "x", c: 1 }, { id: "y", c: 2 }] },
    flag: false,
    nothing: null,
  };

  it("walks properties and id selectors", () => {
    expect(resolvePath(root, "a.b[id=y].c")).toBe(2);
    expect(resolvePath(root, "flag")).toBe(false);
    expect(resolvePath(root, "nothing")).toBeNull();
  });

  it("reports absence with one sentinel", () => {
    const missing = resolvePath(root, "a.b[id=z].c");
    expect(typeof missing).toBe("symbol");
    expect(resolvePath(root, "a.nope")).toBe(missing);
    expect(resolvePath(root, "a.b.c")).toBe(missing);
    expect(resolvePath(root, "nothing.deeper")).toBe(missing);
    expect(resolvePath(root, "a.constructor")).toBe(missing);
  });
});

describe("checkTrace", () => {
  const step = (partial: Partial<TraceStep> & { id: string }): TraceStep => ({
    title: partial.id,
    formula: "",
    inputs: {},
    output: 0,
    ...partial,
  });
  const logOf = (...steps: TraceStep[]): TraceLog => ({ evaluatedAt: "2026-01-01T00:00:00.000Z", steps, tables: [] });
  const kinds = (log: TraceLog, context = {}) => checkTrace(log, context).issues.map((issue) => issue.kind);

  const base = step({
    id: "base",
    expr: "a * 2",
    inputs: { a: { value: 21, from: "profile:personal.age" } },
    output: 42,
  });

  it("accepts a consistent trace and counts what it verified", () => {
    const dependent = step({
      id: "next",
      expr: "x + k",
      inputs: {
        x: { value: 42, from: "step:base" },
        k: { value: 7, from: "const:K.SEVEN" },
        d: { value: 1, from: "derived:something" },
      },
      output: 49,
    });
    const result = checkTrace(logOf(base, dependent), {
      profile: { personal: { age: 21 } },
      constants: { K: { SEVEN: 7 } },
    });
    expect(result.issues).toEqual([]);
    expect(result).toMatchObject({ stepsTotal: 2, exprChecked: 2, exprAbsent: 0, provenanceChecked: 3, provenanceSkipped: 1 });
  });

  it("flags an expression that does not reproduce the output", () => {
    expect(kinds(logOf({ ...base, output: 43 }))).toEqual(["expr-mismatch"]);
  });

  it("flags an expression that cannot be evaluated", () => {
    expect(kinds(logOf({ ...base, expr: "a * unknown" }))).toEqual(["expr-error"]);
  });

  it("treats null as zero and booleans as 0 or 1", () => {
    const flagged = step({
      id: "flagged",
      expr: "n + b",
      inputs: { n: { value: null, from: "derived:none" }, b: { value: true, from: "derived:flag" } },
      output: 1,
    });
    expect(kinds(logOf(flagged))).toEqual([]);
  });

  it("tolerates floating-point noise but not real differences", () => {
    expect(kinds(logOf({ ...base, output: 42 + 1e-12 }))).toEqual([]);
    expect(kinds(logOf({ ...base, output: 42.001 }))).toEqual(["expr-mismatch"]);
  });

  it("flags step references that are unknown, late or inconsistent", () => {
    const refer = (from: string, value = 42) =>
      step({ id: "refer", inputs: { v: { value, from } }, output: value });
    expect(kinds(logOf(base, refer("step:ghost")))).toEqual(["step-missing"]);
    expect(kinds(logOf(refer("step:base"), base))).toEqual(["step-order"]);
    expect(kinds(logOf(base, refer("step:base", 41)))).toEqual(["step-mismatch"]);
  });

  it("flags profile inputs that are absent or different", () => {
    expect(kinds(logOf(base), { profile: {} })).toEqual(["profile-missing"]);
    expect(kinds(logOf(base), { profile: { personal: { age: 22 } } })).toEqual(["profile-mismatch"]);
  });

  it("skips profile inputs when no profile is given", () => {
    const result = checkTrace(logOf(base));
    expect(result.issues).toEqual([]);
    expect(result.provenanceSkipped).toBe(1);
  });

  it("flags constants that are absent or different, and skips structured ones", () => {
    const usesConst = (value: number) =>
      step({ id: "usesConst", inputs: { k: { value, from: "const:K.SEVEN" } }, output: value });
    expect(kinds(logOf(usesConst(7)), { constants: { K: {} } })).toEqual(["const-missing"]);
    expect(kinds(logOf(usesConst(8)), { constants: { K: { SEVEN: 7 } } })).toEqual(["const-mismatch"]);
    expect(kinds(logOf(usesConst(7)), { constants: { K: { SEVEN: { nested: 1 } } } })).toEqual([]);
    expect(kinds(logOf(usesConst(7)))).toEqual([]);
  });
});
