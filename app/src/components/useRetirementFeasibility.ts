import { useMemo } from "react";

import { useHeavyResult } from "../app/useHeavyResult";
import {
  findEarliestFeasibleRetirementAge,
  type ConfidentRetirementAge,
  type RetirementFeasibility,
} from "../domain";
import type { ProfileData } from "../types";

export interface RetirementFeasibilityPair {
  /** The earliest age that works when the assumed return is earned every year. */
  feasibility: RetirementFeasibility;
  /** The earliest age that also holds in the share of simulated markets the risk analysis asks for; null when there is no age to search from, or while it is still being calculated. */
  confidentAge: ConfidentRetirementAge | null;
  /** True while the simulated-market search is still running. The average-market age is ready at once. */
  confidentAgePending: boolean;
}

/** Both earliest-retirement searches, computed once per profile; the slow one runs off the main thread. */
export function useRetirementFeasibility(profile: ProfileData): RetirementFeasibilityPair {
  const feasibility = useMemo(() => findEarliestFeasibleRetirementAge(profile), [profile]);
  const fromAge = feasibility.status === "feasible" ? feasibility.earliestAge : null;
  const { value, pending } = useHeavyResult("confidentAge", profile, { fromAge: fromAge ?? 0 }, fromAge !== null);
  return { feasibility, confidentAge: value ?? null, confidentAgePending: pending };
}
