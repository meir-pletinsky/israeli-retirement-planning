import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../../test/domainFixtures";
import { EMPTY_PROFILE } from "../../types";
import { isStepDone, stepStatus } from "./stepStatus";

describe("stepStatus", () => {
  it("shows nothing as done for an empty plan, whatever step the user is on", () => {
    expect(stepStatus(EMPTY_PROFILE, "personal")).toBe("requiredMissing");
    expect(stepStatus(EMPTY_PROFILE, "pension-savings")).toBe("empty");
    expect(stepStatus(EMPTY_PROFILE, "equity")).toBe("empty");
    expect(stepStatus(EMPTY_PROFILE, "expenses")).toBe("empty");
    expect(stepStatus(EMPTY_PROFILE, "assumptions")).toBe("defaults");
    for (const key of ["personal", "pension-savings", "equity", "expenses", "assumptions"] as const) {
      expect(isStepDone(stepStatus(EMPTY_PROFILE, key))).toBe(false);
    }
  });

  it("completes the personal step once both ages make sense", () => {
    expect(stepStatus(buildTestProfile({ age: 45, retirementAge: 62 }), "personal")).toBe("requiredComplete");
    expect(stepStatus(buildTestProfile({ age: 45 }), "personal")).toBe("requiredMissing");
    expect(stepStatus(buildTestProfile({ age: 45, retirementAge: 45 }), "personal")).toBe("requiredMissing");
  });

  it("needs a partner's retirement age only once the partner has an age and the user is married", () => {
    const base = { age: 50, retirementAge: 65 };
    expect(stepStatus(buildTestProfile({ ...base, maritalStatus: "married", spouse: { age: 48 } }), "personal")).toBe(
      "requiredMissing",
    );
    expect(
      stepStatus(
        buildTestProfile({ ...base, maritalStatus: "married", spouse: { age: 48, retirementAge: 48 } }),
        "personal",
      ),
    ).toBe("requiredComplete");
    expect(stepStatus(buildTestProfile({ ...base, spouse: { age: 48 } }), "personal")).toBe("requiredComplete");
  });

  it("marks the optional steps entered only when they hold data", () => {
    const profile = buildTestProfile({
      age: 45,
      retirementAge: 62,
      equity: [{ quantity: 10, priceUSD: 100 }],
      retirementMonthlyExpenses: 15000,
    });
    expect(stepStatus(profile, "equity")).toBe("entered");
    expect(stepStatus(profile, "expenses")).toBe("entered");
    expect(stepStatus(profile, "pension-savings")).toBe("empty");
    expect(isStepDone(stepStatus(profile, "pension-savings"))).toBe(false);
  });

  it("counts a bank deposit towards the equity and investments step", () => {
    const profile = buildTestProfile({ age: 45, retirementAge: 62, bankDeposits: [{ amount: 100000 }] });
    expect(stepStatus(profile, "equity")).toBe("entered");
  });

  it("calls the assumptions customized only once they differ from the defaults", () => {
    expect(stepStatus(EMPTY_PROFILE, "assumptions")).toBe("defaults");
    expect(stepStatus(buildTestProfile({ age: 45, retirementAge: 62, inflationPct: 3.7 }), "assumptions")).toBe(
      "customized",
    );
  });
});
