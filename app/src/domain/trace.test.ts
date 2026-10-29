import { describe, expect, it } from "vitest";
import {
  engineCurrentYear,
  engineNowMs,
  fromConst,
  fromLatestStep,
  fromProfile,
  fromStep,
  input,
  isTracing,
  recordStep,
  recordTable,
  runTraced,
  traceId,
  withEngineClock,
  withScope,
} from "./trace";

describe("trace context", () => {
  it("is off by default and records nothing, without running the builders", () => {
    let built = 0;
    const id = recordStep("a", () => {
      built += 1;
      return { title: "t", formula: "f", inputs: {}, output: 1 };
    });
    const tableId = recordTable("t", () => {
      built += 1;
      return { title: "t", columns: [], rows: [] };
    });
    expect(isTracing()).toBe(false);
    expect(id).toBe("");
    expect(tableId).toBe("");
    expect(built).toBe(0);
  });

  it("collects steps and tables, and switches itself off afterwards", () => {
    const { result, log } = runTraced(() => {
      expect(isTracing()).toBe(true);
      recordStep("sum", () => ({
        title: "Sum",
        formula: "a + b",
        expr: "a + b",
        inputs: { a: input(1, fromProfile("x")), b: input(2, fromConst("K")) },
        output: 3,
      }));
      recordTable("rows", () => ({ title: "Rows", columns: ["y"], rows: [[1], [2]] }));
      return 42;
    });
    expect(result).toBe(42);
    expect(isTracing()).toBe(false);
    expect(log.steps).toHaveLength(1);
    expect(log.steps[0].id).toBe("sum");
    expect(log.steps[0].inputs.a).toEqual({ value: 1, from: "profile:x" });
    expect(log.tables[0].rows).toEqual([[1], [2]]);
  });

  it("prefixes ids with the scope path and restores the scope", () => {
    const { log } = runTraced(() => {
      withScope("self", () => {
        withScope("account[a1]", () => {
          recordStep("fv", () => ({ title: "", formula: "", inputs: {}, output: 1 }));
          expect(traceId("next")).toBe("self/account[a1]/next");
        });
        recordStep("total", () => ({ title: "", formula: "", inputs: {}, output: 2 }));
      });
      recordStep("top", () => ({ title: "", formula: "", inputs: {}, output: 3 }));
    });
    expect(log.steps.map((s) => s.id)).toEqual(["self/account[a1]/fv", "self/total", "top"]);
  });

  it("restores the scope even when the callback throws", () => {
    runTraced(() => {
      expect(() =>
        withScope("x", () => {
          throw new Error("boom");
        }),
      ).toThrow("boom");
      expect(traceId("y")).toBe("y");
    });
  });

  it("keeps ids unique by numbering a repeated id", () => {
    const { log } = runTraced(() => {
      for (let i = 0; i < 3; i += 1) {
        recordStep("same", () => ({ title: "", formula: "", inputs: {}, output: i }));
      }
    });
    expect(log.steps.map((s) => s.id)).toEqual(["same", "same#2", "same#3"]);
  });

  it("turns non-finite numbers into strings so the pack stays valid JSON", () => {
    const { log } = runTraced(() =>
      recordStep("bad", () => ({
        title: "",
        formula: "",
        inputs: { x: input(Number.NaN, fromStep("s")) },
        output: Number.POSITIVE_INFINITY,
      })),
    );
    expect(log.steps[0].inputs.x.value).toBe("NaN");
    expect(log.steps[0].output).toBe("Infinity");
    expect(() => JSON.stringify(log)).not.toThrow();
  });

  it("lets the engine clock follow the recorded evaluation time", () => {
    const at = new Date("2031-03-04T05:06:07.000Z");
    const { log } = runTraced(
      () => {
        expect(engineNowMs()).toBe(at.getTime());
        expect(engineCurrentYear()).toBe(at.getFullYear());
      },
      { evaluatedAt: at },
    );
    expect(log.evaluatedAt).toBe(at.toISOString());
    expect(Math.abs(engineNowMs() - Date.now())).toBeLessThan(1000);
  });

  it("can fix the engine clock without tracing, and a trace takes precedence", () => {
    const at = new Date("2040-01-02T03:04:05.000Z");
    const inside = withEngineClock(at, () => {
      expect(isTracing()).toBe(false);
      const traced = runTraced(() => engineCurrentYear(), { evaluatedAt: new Date("2045-06-01T00:00:00Z") });
      return { year: engineCurrentYear(), tracedYear: traced.result };
    });
    expect(inside).toEqual({ year: 2040, tracedYear: 2045 });
    expect(Math.abs(engineNowMs() - Date.now())).toBeLessThan(1000);
  });

  it("restores an outer trace after a nested run", () => {
    const { log } = runTraced(() => {
      recordStep("outer", () => ({ title: "", formula: "", inputs: {}, output: 1 }));
      const inner = runTraced(() => {
        recordStep("inner", () => ({ title: "", formula: "", inputs: {}, output: 2 }));
      });
      expect(inner.log.steps.map((s) => s.id)).toEqual(["inner"]);
      expect(isTracing()).toBe(true);
    });
    expect(log.steps.map((s) => s.id)).toEqual(["outer"]);
  });

  it("links to the latest step with a given id, and says so when the value differs", () => {
    runTraced(() => {
      expect(fromLatestStep("later")).toBe("derived:step \"later\" was not recorded");
      recordStep("later", () => ({ title: "", formula: "", inputs: {}, output: 5 }));
      recordStep("later", () => ({ title: "", formula: "", inputs: {}, output: 7 }));
      expect(fromLatestStep("later")).toBe("step:later#2");
      expect(fromLatestStep("later", 7)).toBe("step:later#2");
      expect(fromLatestStep("later", 5)).toBe("derived:step \"later\" holds a different value");
    });
    expect(fromLatestStep("later")).toBe("derived:step \"later\" was not recorded");
  });
});
