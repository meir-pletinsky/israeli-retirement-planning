import type { Gender, ProfileData } from "../types";
import { BITUACH_LEUMI_RATES as RATES, womenRetirementAge } from "./bituachLeumiRates";
import { DEFAULT_CURRENT_AGE } from "./constants";
import {
  engineCurrentYear,
  fromConst,
  fromDerived,
  fromProfile,
  fromStep,
  input,
  isTracing,
  recordStep,
  withScope,
  type TraceInput,
} from "./trace";
import type { BituachLeumiEstimate } from "./types";

/**
 * Statutory retirement age (gil prisha). Men: 67. Women: 62-65 by birth
 * year. Unknown gender falls back to the men's age, the later and so more
 * conservative of the two.
 */
export function statutoryRetirementAge(gender: Gender | null, birthYear: number): number {
  return gender === "female" ? womenRetirementAge(birthYear) : RATES.maleRetirementAge;
}

/**
 * Estimates the Bituach Leumi old-age pension for someone who stops working
 * at `retirementAge`, in today's money.
 *
 * - Claim age: the statutory retirement age, or `retirementAge` when later
 *   (the pension is then assumed deferred because of work income), capped at
 *   the universal eligibility age of 70.
 * - Seniority supplement: 2% per full insured year, up to 50%.
 * - Deferral supplement: 5% per full year between the statutory age and the
 *   claim age.
 * - Insurance accrues until the earlier of retirement and claim. Without an
 *   entered figure, insurance is assumed continuous since age 21.
 * - Eligibility: 144 insured months in total, or 60 months in the last 10
 *   years before the claim age.
 *
 * Not modelled: the earnings test between the statutory age and 70, child
 * supplements, and the means-tested income supplement. The spouse supplement
 * is added by the household layer (see `household.ts`).
 *
 * `referenceYear` is injectable so tests do not depend on the clock.
 */
export function estimateBituachLeumiPension(
  profile: ProfileData,
  retirementAge: number,
  referenceYear: number = engineCurrentYear(),
): BituachLeumiEstimate {
  return withScope("bituachLeumi", () => {
    const { bituachLeumi, personal } = profile;
    const currentAge = personal.age ?? DEFAULT_CURRENT_AGE;
    const birthYear = referenceYear - Math.floor(currentAge);
    const statutoryAge = statutoryRetirementAge(personal.gender, birthYear);
    const claimAge = Math.min(
      Math.max(statutoryAge, retirementAge),
      RATES.universalEligibilityAge,
    );

    const insuredYearsToDate =
      bituachLeumi.insuredYearsToDate ?? Math.max(currentAge - RATES.defaultInsuranceStartAge, 0);
    const insuranceEndAge = Math.min(retirementAge, claimAge);
    const insuredYearsAtClaim =
      insuredYearsToDate + Math.max(insuranceEndAge - currentAge, 0);

    const insuredMonths = Math.floor(insuredYearsAtClaim * 12);
    const monthsSinceInsuranceEnded = Math.max(claimAge - insuranceEndAge, 0) * 12;
    const recentMonths = Math.min(
      insuredMonths,
      Math.max(RATES.qualifyingRecentWindowMonths - monthsSinceInsuranceEnded, 0),
    );
    const eligible =
      insuredMonths >= RATES.qualifyingLifetimeMonths ||
      recentMonths >= RATES.qualifyingRecentMonths;

    const seniorityRate = Math.min(
      RATES.seniorityRatePerYear * Math.floor(insuredYearsAtClaim),
      RATES.seniorityMaxRate,
    );
    const deferralRate = RATES.deferralRatePerYear * Math.floor(Math.max(claimAge - statutoryAge, 0));

    const overrideAmount =
      bituachLeumi.monthlyPensionOverride !== null && bituachLeumi.monthlyPensionOverride > 0
        ? bituachLeumi.monthlyPensionOverride
        : null;
    const calculatedPension = eligible
      ? RATES.basicMonthlyPensionSingle * (1 + seniorityRate) * (1 + deferralRate)
      : 0;

    const monthlyPension = !bituachLeumi.includeInProjection
      ? 0
      : Math.round(overrideAmount ?? calculatedPension);

    recordBituachLeumiSteps({
      profile,
      retirementAge,
      currentAge,
      birthYear,
      statutoryAge,
      claimAge,
      insuredYearsToDate,
      insuranceEndAge,
      insuredYearsAtClaim,
      insuredMonths,
      monthsSinceInsuranceEnded,
      recentMonths,
      eligible,
      seniorityRate,
      deferralRate,
      overrideAmount,
      calculatedPension,
      monthlyPension,
    });

    return {
      included: bituachLeumi.includeInProjection,
      eligible: overrideAmount !== null || eligible,
      source: overrideAmount !== null ? "override" : "calculated",
      statutoryRetirementAge: statutoryAge,
      claimAge,
      insuredYearsAtClaim: Math.floor(insuredYearsAtClaim),
      seniorityRate,
      deferralRate,
      monthlyPension,
      spouseSupplement: null,
    };
  });
}

interface BituachLeumiTraceValues {
  profile: ProfileData;
  retirementAge: number;
  currentAge: number;
  birthYear: number;
  statutoryAge: number;
  claimAge: number;
  insuredYearsToDate: number;
  insuranceEndAge: number;
  insuredYearsAtClaim: number;
  insuredMonths: number;
  monthsSinceInsuranceEnded: number;
  recentMonths: number;
  eligible: boolean;
  seniorityRate: number;
  deferralRate: number;
  overrideAmount: number | null;
  calculatedPension: number;
  monthlyPension: number;
}

const BL = (name: keyof typeof RATES): string => fromConst(`BITUACH_LEUMI_RATES.${name}`);

/** Records each step of the old-age pension estimate. A no-op unless tracing. */
function recordBituachLeumiSteps(v: BituachLeumiTraceValues): void {
  if (!isTracing()) return;
  const { bituachLeumi, personal } = v.profile;
  const currentAge = recordStep("currentAge", () => ({
    title: "Current age",
    formula: "the age entered, or DEFAULT_CURRENT_AGE when it is blank",
    inputs: {
      age: input(personal.age, fromProfile("personal.age")),
      defaultAge: input(DEFAULT_CURRENT_AGE, fromConst("DEFAULT_CURRENT_AGE")),
    },
    output: v.currentAge,
  }));
  const retirementAge = recordStep("retirementAge", () => ({
    title: "Retirement age in this scenario",
    formula: "set by the scenario's retirement timing (see scenario.timing in the pack)",
    inputs: { retirementAge: input(v.retirementAge, fromDerived("scenario.timing")) },
    output: v.retirementAge,
  }));
  const birthYear = recordStep("birthYear", () => ({
    title: "Birth year (estimated from the age)",
    formula: "reference year - whole years of age",
    expr: "referenceYear - floor(currentAge)",
    inputs: {
      referenceYear: input(v.birthYear + Math.floor(v.currentAge), fromDerived("meta.baseYear")),
      currentAge: input(v.currentAge, fromStep(currentAge)),
    },
    output: v.birthYear,
  }));
  const statutoryAge = recordStep("statutoryAge", () => {
    const female = personal.gender === "female";
    return {
      title: "Statutory retirement age (gil prisha)",
      formula: female
        ? "women: 62 to 65 by birth year (table in BITUACH_LEUMI_RATES / womenRetirementAge)"
        : "men, and an unknown gender: the men's age",
      expr: female ? "womenAge" : "maleRetirementAge",
      inputs: {
        gender: input(personal.gender, fromProfile("personal.gender")),
        birthYear: input(v.birthYear, fromStep(birthYear)),
        ...(female
          ? {
              womenAge: input(
                v.statutoryAge,
                fromConst(`WOMEN_RETIREMENT_AGE_BY_BIRTH_YEAR.${v.birthYear}`),
              ),
            }
          : { maleRetirementAge: input(RATES.maleRetirementAge, BL("maleRetirementAge")) }),
      },
      output: v.statutoryAge,
    };
  });
  const claimAge = recordStep("claimAge", () => ({
    title: "Age the pension is claimed",
    formula: "the later of the statutory age and the retirement age, capped at the universal eligibility age",
    expr: "min(max(statutoryAge, retirementAge), universalEligibilityAge)",
    inputs: {
      statutoryAge: input(v.statutoryAge, fromStep(statutoryAge)),
      retirementAge: input(v.retirementAge, fromStep(retirementAge)),
      universalEligibilityAge: input(RATES.universalEligibilityAge, BL("universalEligibilityAge")),
    },
    output: v.claimAge,
  }));
  const entered = bituachLeumi.insuredYearsToDate;
  const insuredYearsToDate = recordStep("insuredYearsToDate", () => ({
    title: "Insured years to date",
    formula:
      entered !== null
        ? "the figure entered"
        : "assumed continuous insurance since the default start age",
    expr: entered !== null ? "entered" : "max(currentAge - defaultInsuranceStartAge, 0)",
    inputs: (entered !== null
      ? { entered: input(entered, fromProfile("bituachLeumi.insuredYearsToDate")) }
      : {
          currentAge: input(v.currentAge, fromStep(currentAge)),
          defaultInsuranceStartAge: input(
            RATES.defaultInsuranceStartAge,
            BL("defaultInsuranceStartAge"),
          ),
        }) as Record<string, TraceInput>,
    output: v.insuredYearsToDate,
  }));
  const insuranceEndAge = recordStep("insuranceEndAge", () => ({
    title: "Age insurance stops accruing",
    formula: "the earlier of the retirement age and the claim age",
    expr: "min(retirementAge, claimAge)",
    inputs: {
      retirementAge: input(v.retirementAge, fromStep(retirementAge)),
      claimAge: input(v.claimAge, fromStep(claimAge)),
    },
    output: v.insuranceEndAge,
  }));
  const insuredYearsAtClaim = recordStep("insuredYearsAtClaim", () => ({
    title: "Insured years at the claim age",
    formula: "insured years to date + years from now until insurance stops",
    expr: "insuredYearsToDate + max(insuranceEndAge - currentAge, 0)",
    inputs: {
      insuredYearsToDate: input(v.insuredYearsToDate, fromStep(insuredYearsToDate)),
      insuranceEndAge: input(v.insuranceEndAge, fromStep(insuranceEndAge)),
      currentAge: input(v.currentAge, fromStep(currentAge)),
    },
    output: v.insuredYearsAtClaim,
  }));
  const insuredMonths = recordStep("insuredMonths", () => ({
    title: "Insured months at the claim age",
    formula: "whole months of the insured years",
    expr: "floor(insuredYearsAtClaim * 12)",
    inputs: { insuredYearsAtClaim: input(v.insuredYearsAtClaim, fromStep(insuredYearsAtClaim)) },
    output: v.insuredMonths,
  }));
  const monthsSinceEnded = recordStep("monthsSinceInsuranceEnded", () => ({
    title: "Months between the end of insurance and the claim",
    formula: "(claim age - insurance end age) × 12, never negative",
    expr: "max(claimAge - insuranceEndAge, 0) * 12",
    inputs: {
      claimAge: input(v.claimAge, fromStep(claimAge)),
      insuranceEndAge: input(v.insuranceEndAge, fromStep(insuranceEndAge)),
    },
    output: v.monthsSinceInsuranceEnded,
  }));
  const recentMonths = recordStep("recentMonths", () => ({
    title: "Insured months within the last 10 years before the claim",
    formula: "min(insured months, window - months since insurance ended), never negative",
    expr: "min(insuredMonths, max(window - monthsSinceInsuranceEnded, 0))",
    inputs: {
      insuredMonths: input(v.insuredMonths, fromStep(insuredMonths)),
      window: input(RATES.qualifyingRecentWindowMonths, BL("qualifyingRecentWindowMonths")),
      monthsSinceInsuranceEnded: input(v.monthsSinceInsuranceEnded, fromStep(monthsSinceEnded)),
    },
    output: v.recentMonths,
  }));
  const eligible = recordStep("eligible", () => ({
    title: "Qualifies for the old-age pension",
    formula: "insured months >= lifetime requirement, or recent months >= recent requirement",
    inputs: {
      insuredMonths: input(v.insuredMonths, fromStep(insuredMonths)),
      qualifyingLifetimeMonths: input(RATES.qualifyingLifetimeMonths, BL("qualifyingLifetimeMonths")),
      recentMonths: input(v.recentMonths, fromStep(recentMonths)),
      qualifyingRecentMonths: input(RATES.qualifyingRecentMonths, BL("qualifyingRecentMonths")),
    },
    output: v.eligible,
  }));
  const seniorityRate = recordStep("seniorityRate", () => ({
    title: "Seniority supplement rate",
    formula: "2% per full insured year, capped",
    expr: "min(seniorityRatePerYear * floor(insuredYearsAtClaim), seniorityMaxRate)",
    inputs: {
      seniorityRatePerYear: input(RATES.seniorityRatePerYear, BL("seniorityRatePerYear")),
      insuredYearsAtClaim: input(v.insuredYearsAtClaim, fromStep(insuredYearsAtClaim)),
      seniorityMaxRate: input(RATES.seniorityMaxRate, BL("seniorityMaxRate")),
    },
    output: v.seniorityRate,
  }));
  const deferralRate = recordStep("deferralRate", () => ({
    title: "Deferral supplement rate",
    formula: "5% per full year between the statutory age and the claim age",
    expr: "deferralRatePerYear * floor(max(claimAge - statutoryAge, 0))",
    inputs: {
      deferralRatePerYear: input(RATES.deferralRatePerYear, BL("deferralRatePerYear")),
      claimAge: input(v.claimAge, fromStep(claimAge)),
      statutoryAge: input(v.statutoryAge, fromStep(statutoryAge)),
    },
    output: v.deferralRate,
  }));
  const calculated = recordStep("calculatedPension", () => ({
    title: "Calculated monthly pension",
    formula: "basic pension × (1 + seniority rate) × (1 + deferral rate); 0 when not eligible",
    expr: v.eligible
      ? "basicMonthlyPensionSingle * (1 + seniorityRate) * (1 + deferralRate)"
      : "0",
    inputs: {
      eligible: input(v.eligible, fromStep(eligible)),
      basicMonthlyPensionSingle: input(RATES.basicMonthlyPensionSingle, BL("basicMonthlyPensionSingle")),
      seniorityRate: input(v.seniorityRate, fromStep(seniorityRate)),
      deferralRate: input(v.deferralRate, fromStep(deferralRate)),
    },
    output: v.calculatedPension,
  }));
  recordStep("monthlyPension", () => ({
    title: "Monthly old-age pension in this scenario (today's money, rounded)",
    formula: !bituachLeumi.includeInProjection
      ? "0: the pension is switched off in the projection"
      : v.overrideAmount !== null
        ? "round(the user's own monthly figure)"
        : "round(calculated pension)",
    expr: !bituachLeumi.includeInProjection
      ? "0"
      : v.overrideAmount !== null
        ? "round(override)"
        : "round(calculatedPension)",
    inputs: {
      includeInProjection: input(
        bituachLeumi.includeInProjection,
        fromProfile("bituachLeumi.includeInProjection"),
      ),
      override: input(v.overrideAmount, fromProfile("bituachLeumi.monthlyPensionOverride")),
      calculatedPension: input(v.calculatedPension, fromStep(calculated)),
    },
    output: v.monthlyPension,
    note: "This is a rounding point: the amount is rounded to whole shekels.",
  }));
}

/**
 * The income-supplement guarantee is a minimum total income for people with
 * low other income. Returns true when the projected total retirement income
 * is below it, i.e. they may qualify (subject to a means test). A couple is
 * compared against the couple guarantee.
 */
export function mayQualifyForIncomeSupplement(
  totalMonthlyIncome: number,
  isCouple: boolean = false,
): boolean {
  return (
    totalMonthlyIncome <
    (isCouple
      ? RATES.incomeSupplementGuaranteeCouple
      : RATES.incomeSupplementGuaranteeSingleUnder70)
  );
}
