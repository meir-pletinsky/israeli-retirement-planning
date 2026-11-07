import type { ProfileData, RetirementScenario } from "../types";
import { findEarliestConfidentRetirementAge } from "./feasibility";
import { runMonteCarlo, successBand } from "./monteCarlo";

/**
 * The calculations that take long enough to freeze the page: each runs thousands of simulated
 * markets. They take plain data and return plain data, so the app can run them in a Web Worker
 * (see `app/heavyCompute.ts`) or, where there is none, on the main thread.
 */
export const HEAVY_TASKS = {
  /** The full Monte Carlo risk analysis for one retirement scenario. */
  riskAnalysis: (profile: ProfileData, args: { scenario: RetirementScenario }) =>
    runMonteCarlo(profile, args.scenario),

  /**
   * The Dashboard's Monte Carlo run at the standard scenario. Only the success rate is shown, so
   * the search for a dependable spending level is skipped unless the rate is below the "strong" bar.
   */
  dashboardRisk: (profile: ProfileData, _args: Record<string, never>) => {
    const quick = runMonteCarlo(profile, "standard", { findConfidentSpending: false });
    if (!quick || successBand(quick.successProbability) === "strong") return quick;
    return runMonteCarlo(profile, "standard");
  },

  /** The earliest retirement age that holds in the confident share of simulated markets. */
  confidentAge: (profile: ProfileData, args: { fromAge: number }) =>
    findEarliestConfidentRetirementAge(profile, args.fromAge),
};

export type HeavyTaskName = keyof typeof HEAVY_TASKS;
export type HeavyArgs<N extends HeavyTaskName> = Parameters<(typeof HEAVY_TASKS)[N]>[1];
export type HeavyResult<N extends HeavyTaskName> = ReturnType<(typeof HEAVY_TASKS)[N]>;

/** A request to the worker. `id` pairs the answer with the request. */
export interface HeavyRequest {
  id: number;
  task: HeavyTaskName;
  profile: ProfileData;
  args: unknown;
}

export type HeavyResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

export function runHeavyTask<N extends HeavyTaskName>(
  task: N,
  profile: ProfileData,
  args: HeavyArgs<N>,
): HeavyResult<N> {
  const run = HEAVY_TASKS[task] as (profile: ProfileData, args: HeavyArgs<N>) => HeavyResult<N>;
  return run(profile, args);
}
