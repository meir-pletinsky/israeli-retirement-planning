import {
  COVER_OPTIONS,
  createCoverPlan,
  type AccountOwner,
  type CoverOption,
  type CoverPlan,
  type ProfileData,
} from "../types";
import {
  accountsOfPerson,
  coverMonthlyCost,
  coverOnFile,
  coverTotalCost,
  coverWindows,
  survivorsGapInMoney,
  type CoverOnFile,
  type CoverWindows,
  type SurvivorsGapInMoney,
} from "./coverPlan";
import { selfProfileView, spouseProfileView } from "./household";
import { realAnnualReturnRate, resolveRetirementAge, resolveSpouseRetirementAge } from "./profileBasics";
import { buildSources } from "./sources";

/**
 * One person's cover figures for one plan: the windows, the cost and the gap in
 * money. The windows and the cost are pure (`coverPlan.ts`); this adds what needs
 * the profile (the cover on file and the projected balances). Design:
 * `docs/insurance-cover-design.md`.
 */
export interface CoverAnalysis {
  person: AccountOwner;
  /** The age at which this person's deposits stop. */
  retirementAge: number;
  /** The saved plan; null while the person has not decided. */
  saved: CoverPlan | null;
  /** The plan the figures use: the given or saved one, else "none" (what happens if nothing is done). */
  plan: CoverPlan;
  onFile: CoverOnFile;
  windows: CoverWindows;
  monthlyCost: number | null;
  totalCost: number | null;
  /** Null when no account states a survivors' pension. */
  survivors: SurvivorsGapInMoney | null;
}

export function savedCoverPlan(profile: ProfileData, person: AccountOwner): CoverPlan | null {
  return person === "spouse" ? profile.spouse.coverPlan : profile.personal.coverPlan;
}

export function personRetirementAge(profile: ProfileData, person: AccountOwner): number {
  return person === "spouse"
    ? resolveSpouseRetirementAge(profile, "standard")
    : resolveRetirementAge(profile, "standard");
}

/**
 * `options.plan` replaces the saved plan (the Projections card compares options);
 * `options.retirementAge` replaces the entered retirement age.
 */
export function analyseCover(
  profile: ProfileData,
  person: AccountOwner,
  options: { plan?: CoverPlan; retirementAge?: number } = {},
): CoverAnalysis {
  const saved = savedCoverPlan(profile, person);
  const plan = options.plan ?? saved ?? createCoverPlan("none");
  const retirementAge = options.retirementAge ?? personRetirementAge(profile, person);
  const onFile = coverOnFile(profile, person);
  const windows = coverWindows(plan, retirementAge);
  const monthlyCost = coverMonthlyCost(plan, onFile.monthlyRiskDeduction);
  return {
    person,
    retirementAge,
    saved,
    plan,
    onFile,
    windows,
    monthlyCost,
    totalCost: coverTotalCost(monthlyCost, windows),
    survivors: onFile.monthlySurvivorsPension > 0 ? survivorsOf(profile, person, retirementAge, windows) : null,
  };
}

/**
 * The people whose cover on file will lapse before the age it is needed until and who
 * have not chosen what to do. The Dashboard shows one line for each; it changes no number.
 */
export function findCoverNotices(profile: ProfileData): CoverAnalysis[] {
  return (["self", "spouse"] as const)
    .filter((person) => savedCoverPlan(profile, person) === null && coverOnFile(profile, person).hasCover)
    .map((person) => analyseCover(profile, person))
    .filter((analysis) => analysis.windows.gapYears > 0);
}

/**
 * The plan an option stands for when compared side by side: the saved plan for its own
 * option, otherwise a fresh plan that keeps only the saved need-until age (a cost or a
 * term end typed for another option does not carry over).
 */
export function planForOption(saved: CoverPlan | null, option: CoverOption): CoverPlan {
  if (saved?.option === option) return saved;
  return { ...createCoverPlan(option), needUntilAge: saved?.needUntilAge ?? null };
}

export interface CoverOptionResult extends CoverAnalysis {
  option: CoverOption;
  /** True for the option that is the saved plan. */
  isSaved: boolean;
}

export interface CoverComparison {
  person: AccountOwner;
  retirementAge: number;
  /** One row for each option, in `COVER_OPTIONS` order. */
  rows: CoverOptionResult[];
}

/**
 * The three options side by side for each person who has cover on file and would have a gap
 * if they did nothing. Nobody is listed when the cover on file already reaches the age it is needed until.
 */
export function compareCoverOptions(profile: ProfileData): CoverComparison[] {
  const comparisons: CoverComparison[] = [];
  for (const person of ["self", "spouse"] as const) {
    if (!coverOnFile(profile, person).hasCover) continue;
    const saved = savedCoverPlan(profile, person);
    const rows = COVER_OPTIONS.map((option) => ({
      ...analyseCover(profile, person, { plan: planForOption(saved, option) }),
      option,
      isSaved: saved?.option === option,
    }));
    if (rows[0].windows.gapYears <= 0) continue;
    comparisons.push({ person, retirementAge: rows[0].retirementAge, rows });
  }
  return comparisons;
}

function survivorsOf(
  profile: ProfileData,
  person: AccountOwner,
  retirementAge: number,
  windows: CoverWindows,
): SurvivorsGapInMoney {
  const view = person === "spouse" ? spouseProfileView(profile) : selfProfileView(profile);
  const valueAtRetirement = new Map(buildSources(view, retirementAge).map((source) => [source.id, source.valueAtRetirement]));
  const growth = Math.pow(
    1 + realAnnualReturnRate(profile.assumptions),
    Math.max(windows.gapStartAge - retirementAge, 0),
  );
  return survivorsGapInMoney(
    accountsOfPerson(profile, person)
      .filter((account) => account.accountStatus === "activeContributing")
      .map((account) => ({
        monthlySurvivorsPension: Math.max(account.insuranceCoverages.monthlySurvivorsSpousePension ?? 0, 0),
        balanceAtGapStart: (valueAtRetirement.get(account.id) ?? 0) * growth,
        conversionFactor: account.annuityParameters.conversionFactor,
      })),
  );
}
