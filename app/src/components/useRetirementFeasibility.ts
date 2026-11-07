import { useMemo } from "react";

import {
  findEarliestConfidentRetirementAge,
  findEarliestFeasibleRetirementAge,
  type ConfidentRetirementAge,
  type RetirementFeasibility,
} from "../domain";
import type { ProfileData } from "../types";

export interface RetirementFeasibilityPair {
  /** The earliest age that works when the assumed return is earned every year. */
  feasibility: RetirementFeasibility;
  /** The earliest age that also holds in the share of simulated markets the risk analysis asks for; null when there is no age to search from. */
  confidentAge: ConfidentRetirementAge | null;
}

/** Both earliest-retirement searches, computed once per profile. */
export function useRetirementFeasibility(profile: ProfileData): RetirementFeasibilityPair {
  return useMemo(() => {
    const feasibility = findEarliestFeasibleRetirementAge(profile);
    const confidentAge =
      feasibility.status === "feasible" && feasibility.earliestAge !== null
        ? findEarliestConfidentRetirementAge(profile, feasibility.earliestAge)
        : null;
    return { feasibility, confidentAge };
  }, [profile]);
}
