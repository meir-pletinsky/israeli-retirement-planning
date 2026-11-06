import { profileSectionHasData, type ProfileData, type ProfileSection } from "../../types";
import type { StepKey } from "./stepOrder";

/**
 * What the stepper can honestly say about a step, from the saved data alone (never from where
 * the user has navigated):
 * - requiredComplete / requiredMissing: the Personal step, whose two ages the plan needs;
 * - entered / empty: an optional step that has, or has not, been given anything;
 * - customized / defaults: Assumptions, which always has working defaults.
 */
export type StepStatus =
  | "requiredComplete"
  | "requiredMissing"
  | "entered"
  | "empty"
  | "customized"
  | "defaults";

const DATA_SECTIONS: Record<Exclude<StepKey, "personal">, readonly ProfileSection[]> = {
  "pension-savings": ["pensionSavings"],
  // Bank deposits are entered on the same step as equity holdings.
  equity: ["equity", "bankDeposits"],
  expenses: ["expenses"],
  assumptions: ["assumptions"],
};

export function stepStatus(profile: ProfileData, key: StepKey): StepStatus {
  if (key === "personal") {
    const { age, retirementAge, maritalStatus } = profile.personal;
    const { spouse } = profile;
    const selfOk = age !== null && retirementAge !== null && retirementAge > age;
    // Mirrors the Personal step's own check: a partner who has an age needs a valid retirement age.
    const spouseOk =
      maritalStatus !== "married" ||
      spouse.age === null ||
      (spouse.retirementAge !== null && spouse.retirementAge >= spouse.age);
    return selfOk && spouseOk ? "requiredComplete" : "requiredMissing";
  }
  const hasData = DATA_SECTIONS[key].some((section) => profileSectionHasData(profile, section));
  if (key === "assumptions") return hasData ? "customized" : "defaults";
  return hasData ? "entered" : "empty";
}

/** Whether the step shows a check mark: only for steps with real, sufficient content. */
export function isStepDone(status: StepStatus): boolean {
  return status === "requiredComplete" || status === "entered" || status === "customized";
}
