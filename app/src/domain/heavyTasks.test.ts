import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { findEarliestConfidentRetirementAge, findEarliestFeasibleRetirementAge } from "./feasibility";
import { HEAVY_TASKS, runHeavyTask } from "./heavyTasks";
import { runMonteCarlo, successBand } from "./monteCarlo";

function planFor(desiredMonthly: number) {
  return buildTestProfile({
    age: 40,
    retirementAge: 67,
    gender: "male",
    monthlyGrossSalary: 20_000,
    investmentReturnPct: 5,
    inflationPct: 2,
    pensionBalances: [900_000, 300_000],
    retirementMonthlyExpenses: desiredMonthly,
  });
}

const SLOW = 60_000;

describe("heavy tasks", () => {
  it("riskAnalysis is the full Monte Carlo run for the chosen scenario", { timeout: SLOW }, () => {
    const profile = planFor(9_000);
    const result = runHeavyTask("riskAnalysis", profile, { scenario: "standard" });
    expect(result).toEqual(runMonteCarlo(profile, "standard"));
    expect(result?.confidentMonthlySpending).not.toBeNull();
  });

  it("dashboardRisk skips the confident-spending search when the plan is already strong", { timeout: SLOW }, () => {
    const profile = planFor(2_500);
    const quick = runMonteCarlo(profile, "standard", { findConfidentSpending: false });
    expect(successBand(quick!.successProbability)).toBe("strong");
    expect(runHeavyTask("dashboardRisk", profile, {})).toEqual(quick);
  });

  it("dashboardRisk runs the full analysis when the plan is not strong", { timeout: SLOW }, () => {
    const profile = planFor(40_000);
    const quick = runMonteCarlo(profile, "standard", { findConfidentSpending: false });
    expect(successBand(quick!.successProbability)).not.toBe("strong");
    expect(runHeavyTask("dashboardRisk", profile, {})).toEqual(runMonteCarlo(profile, "standard"));
  });

  it("dashboardRisk is null when there is nothing to test", () => {
    const profile = buildTestProfile({ age: 40, retirementAge: 67, retirementMonthlyExpenses: 0 });
    expect(runHeavyTask("dashboardRisk", profile, {})).toBeNull();
  });

  it("confidentAge searches from the given age", { timeout: SLOW }, () => {
    const profile = planFor(9_000);
    const feasibility = findEarliestFeasibleRetirementAge(profile);
    expect(feasibility.status).toBe("feasible");
    const fromAge = feasibility.status === "feasible" ? feasibility.earliestAge : 0;
    expect(runHeavyTask("confidentAge", profile, { fromAge })).toEqual(
      findEarliestConfidentRetirementAge(profile, fromAge),
    );
  });

  it("takes and returns plain data, so a worker can pass it between threads", { timeout: SLOW }, () => {
    const profile = planFor(9_000);
    expect(structuredClone(profile)).toEqual(profile);
    const result = runHeavyTask("dashboardRisk", profile, {});
    expect(structuredClone(result)).toEqual(result);
  });

  it("lists every task by name", () => {
    expect(Object.keys(HEAVY_TASKS).sort()).toEqual(["confidentAge", "dashboardRisk", "riskAnalysis"]);
  });
});
