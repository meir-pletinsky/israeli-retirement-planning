import type { ExpensesData, PlanningHorizonAge, ProfileData } from "../types";
import { ACCESS_RULES } from "./accessRules";
import { estimateBituachLeumiPension } from "./bituachLeumi";
import { projectCashFlow, type CashFlowPlan } from "./cashFlow";
import { COMPARISON_MAX_AGE, COMPARISON_MIN_AGE } from "./scenarioComparison";
import { desiredRetirementMonthly, expenseTotals } from "./expenses";
import { estimateIncomeBreakdown, type IncomeBreakdownPoint } from "./incomeBreakdown";
import { buildHousehold, resolveRetirementTiming } from "./household";
import { estimateNetIncome } from "./netIncome";
import { projectSpendingFunding } from "./netWorth";
import {
  isHouseholdActive,
  ownAccounts,
  resolveCurrentAge,
  resolveRetirementAge,
  resolveSpouseCurrentAge,
  resolveSpouseRetirementAge,
  spouseAccounts,
  usdToIlsRate,
} from "./profileBasics";
import { estimateHouseholdRetirementIncome } from "./retirementIncome";
import { startsAnnuityByChoice } from "./sources";
import { withPriceDrop } from "./stressTests";

/**
 * The what-if layer: a draft set of values that is laid over the saved profile to make a derived
 * profile, which the ordinary engine then runs. The saved profile is never changed, so the
 * draft can be thrown away or applied.
 */
export interface WhatIfValues {
  /** The primary user's retirement age. */
  retirementAge: number;
  /** The spouse's retirement age; null while the plan covers one person. */
  spouseRetirementAge: number | null;
  /** The age the primary user's annuities start; null = as early as they may, which follows the retirement age. */
  pensionStartAge: number | null;
  /** The spouse's annuity start age; null = as early as they may, and while the plan covers one person. */
  spousePensionStartAge: number | null;
  investmentReturnPct: number;
  inflationPct: number;
  /** Planned monthly spending in retirement, today's money; 0 when none is entered. */
  monthlySpending: number;
  /** A one-off move in every share price, in percent. Never saved to the plan. */
  sharesChangePct: number;
  /** A one-off move in the dollar against the shekel, in percent. Never saved to the plan. */
  dollarChangePct: number;
  planningHorizonAge: PlanningHorizonAge;
}

export type WhatIfOverrides = Partial<WhatIfValues>;

/** The values that move along a slider. */
export type WhatIfSliderKey = Exclude<keyof WhatIfValues, "planningHorizonAge">;

export interface WhatIfRange {
  min: number;
  max: number;
  step: number;
}

/** The slider keys that make up the plan rather than a market move; "Apply" saves only these. */
export const PLAN_KEYS = [
  "retirementAge",
  "spouseRetirementAge",
  "pensionStartAge",
  "spousePensionStartAge",
  "investmentReturnPct",
  "inflationPct",
  "monthlySpending",
  "planningHorizonAge",
] as const satisfies readonly (keyof WhatIfValues)[];

export type PensionStartKey = "pensionStartAge" | "spousePensionStartAge";

const RETIREMENT_KEY_OF: Record<PensionStartKey, "retirementAge" | "spouseRetirementAge"> = {
  pensionStartAge: "retirementAge",
  spousePensionStartAge: "spouseRetirementAge",
};

export const isPensionStartKey = (key: WhatIfSliderKey): key is PensionStartKey => key in RETIREMENT_KEY_OF;

/** The latest start age the pension slider offers. */
const PENSION_START_MAX_AGE = 70;

/** The earliest age an annuity can start for someone who retires at `retirementAge`. */
export const earliestPensionStartAge = (retirementAge: number) =>
  Math.max(ACCESS_RULES.earliestAnnuityAge, Math.ceil(retirementAge));

/** The age the annuities start at: the chosen age, never before retirement or the earliest age they can be paid. */
export const effectivePensionStartAge = (chosen: number | null, retirementAge: number) =>
  Math.max(chosen ?? 0, earliestPensionStartAge(retirementAge));

/** The age a pension slider shows: the chosen start age at the draft's own retirement age. */
export const pensionStartOf = (values: WhatIfValues, key: PensionStartKey) =>
  effectivePensionStartAge(values[key], values[RETIREMENT_KEY_OF[key]] ?? 0);

/** The saved plan's own values: where every slider starts. */
export function baselineWhatIf(profile: ProfileData): WhatIfValues {
  const couple = isHouseholdActive(profile);
  return {
    retirementAge: resolveRetirementAge(profile, "standard"),
    spouseRetirementAge: couple ? resolveSpouseRetirementAge(profile, "standard") : null,
    pensionStartAge: profile.personal.pensionStartAge,
    spousePensionStartAge: couple ? profile.spouse.pensionStartAge : null,
    investmentReturnPct: profile.assumptions.investmentReturnPct,
    inflationPct: profile.assumptions.inflationPct,
    monthlySpending: desiredRetirementMonthly(profile.expenses) ?? 0,
    sharesChangePct: 0,
    dollarChangePct: 0,
    planningHorizonAge: profile.assumptions.planningHorizonAge,
  };
}

/** The baseline with the draft's overrides on top. */
export function whatIfValues(profile: ProfileData, overrides: WhatIfOverrides): WhatIfValues {
  return { ...baselineWhatIf(profile), ...overrides };
}

const roundTo = (value: number, digits = 4) => Number(value.toFixed(digits));

/**
 * A slider range that keeps `base` exactly on a step: it reaches `below` under and `above` over
 * the baseline, held inside the hard limits.
 */
function range(base: number, step: number, below: number, above: number, hardMin: number, hardMax: number): WhatIfRange {
  const stepsDown = Math.max(Math.min(Math.floor((base - hardMin) / step), Math.floor(below / step)), 0);
  const stepsUp = Math.max(Math.min(Math.floor((hardMax - base) / step), Math.floor(above / step)), 0);
  return { min: roundTo(base - stepsDown * step), max: roundTo(base + stepsUp * step), step };
}

/**
 * Where each slider may go. The ranges are centred on the saved plan, so a slider at its middle
 * is the plan, and are held inside what the engine and the app consider reasonable. A pension
 * start slider begins at the earliest age the draft allows, so its range follows the draft's
 * retirement ages.
 */
export function whatIfRanges(
  profile: ProfileData,
  draft: WhatIfValues = baselineWhatIf(profile),
): Record<WhatIfSliderKey, WhatIfRange> {
  const base = baselineWhatIf(profile);
  const ownFloor = Math.max(COMPARISON_MIN_AGE, Math.ceil(resolveCurrentAge(profile)));
  const spouseFloor = Math.max(COMPARISON_MIN_AGE, Math.ceil(resolveSpouseCurrentAge(profile)));
  const spendingStep = 100;
  const pensionStart = (retirementAge: number): WhatIfRange => {
    const min = earliestPensionStartAge(retirementAge);
    return { min, max: Math.max(PENSION_START_MAX_AGE, min), step: 1 };
  };
  return {
    retirementAge: range(base.retirementAge, 1, 10, 10, ownFloor, COMPARISON_MAX_AGE),
    spouseRetirementAge:
      base.spouseRetirementAge === null
        ? { min: 0, max: 0, step: 1 }
        : range(base.spouseRetirementAge, 1, 10, 10, spouseFloor, COMPARISON_MAX_AGE),
    pensionStartAge: pensionStart(draft.retirementAge),
    spousePensionStartAge:
      draft.spouseRetirementAge === null ? { min: 0, max: 0, step: 1 } : pensionStart(draft.spouseRetirementAge),
    investmentReturnPct: range(base.investmentReturnPct, 0.5, 4, 4, 0, 12),
    inflationPct: range(base.inflationPct, 0.5, 3, 3, 0, 8),
    monthlySpending:
      base.monthlySpending > 0
        ? range(
            base.monthlySpending,
            spendingStep,
            base.monthlySpending * 0.5,
            base.monthlySpending * 0.75,
            spendingStep,
            Number.POSITIVE_INFINITY,
          )
        : { min: 0, max: 30_000, step: 500 },
    sharesChangePct: { min: -50, max: 50, step: 5 },
    dollarChangePct: { min: -30, max: 30, step: 5 },
  };
}

/** A fact about the current values that the sliders cannot show on their own. */
export type WhatIfNoteKey = "pensionLocked" | "stateLater" | "spouseLocked" | "noSpending" | "pensionDelayed";

export interface WhatIfNote {
  key: WhatIfNoteKey;
  /** The slider the note belongs under. */
  slider: WhatIfSliderKey;
  age?: number;
}

/** Whether a person has an annuity whose start age can be moved: one modelled as a lifelong pension that has not started paying. */
export function canChoosePensionStart(profile: ProfileData, person: "self" | "spouse"): boolean {
  return (person === "spouse" ? spouseAccounts(profile) : ownAccounts(profile)).some(startsAnnuityByChoice);
}

/** Why the current values behave as they do: the pension unlock age and the state pension age. */
export function whatIfNotes(profile: ProfileData, values: WhatIfValues): WhatIfNote[] {
  const notes: WhatIfNote[] = [];
  const unlockAge = ACCESS_RULES.earliestAnnuityAge;
  if (values.retirementAge < unlockAge) {
    notes.push({ key: "pensionLocked", slider: "retirementAge", age: unlockAge });
  }
  if (profile.bituachLeumi.includeInProjection) {
    const statutoryAge = estimateBituachLeumiPension(profile, values.retirementAge).statutoryRetirementAge;
    if (values.retirementAge < statutoryAge) {
      notes.push({ key: "stateLater", slider: "retirementAge", age: statutoryAge });
    }
  }
  if (values.spouseRetirementAge !== null && values.spouseRetirementAge < unlockAge) {
    notes.push({ key: "spouseLocked", slider: "spouseRetirementAge", age: unlockAge });
  }
  const pensionSliders: [PensionStartKey, "self" | "spouse"][] = [["pensionStartAge", "self"]];
  if (values.spouseRetirementAge !== null) pensionSliders.push(["spousePensionStartAge", "spouse"]);
  for (const [key, person] of pensionSliders) {
    const start = pensionStartOf(values, key);
    if (start > earliestPensionStartAge(values[RETIREMENT_KEY_OF[key]] ?? 0) && canChoosePensionStart(profile, person)) {
      notes.push({ key: "pensionDelayed", slider: key, age: start });
    }
  }
  if (baselineWhatIf(profile).monthlySpending <= 0) {
    notes.push({ key: "noSpending", slider: "monthlySpending" });
  }
  return notes;
}

/**
 * The planned spending set to `target` a month. An itemised budget is scaled item by item, which
 * keeps its essential and discretionary split; otherwise the typed total is replaced.
 */
function withSpending(expenses: ExpensesData, target: number): ExpensesData {
  const current = desiredRetirementMonthly(expenses) ?? 0;
  if (Math.round(target) === Math.round(current)) return expenses;
  if (expenses.mode === "detailed") {
    const total = expenseTotals(expenses.items).total;
    if (total > 0 && target > 0) {
      const factor = target / total;
      return {
        ...expenses,
        items: expenses.items.map((item) =>
          item.amount === null ? item : { ...item, amount: Math.round(item.amount * factor) },
        ),
      };
    }
  }
  return { ...expenses, mode: "totals", retirementMonthly: target };
}

/**
 * The saved profile with the draft laid over it. Returns the saved profile itself when the draft
 * changes nothing, so the baseline and an untouched draft are the same object.
 */
export function applyWhatIf(profile: ProfileData, values: WhatIfValues): ProfileData {
  const base = baselineWhatIf(profile);
  const same = (Object.keys(base) as (keyof WhatIfValues)[]).every((key) => base[key] === values[key]);
  if (same) return profile;

  const couple = isHouseholdActive(profile);
  const holdings =
    values.sharesChangePct === 0
      ? profile.equity.holdings
      : profile.equity.holdings.map((holding) => withPriceDrop(holding, -values.sharesChangePct));
  // A start age that is no later than the earliest possible one is saved as "as early as allowed",
  // so it keeps following the retirement age.
  const savedStart = (chosen: number | null, retirementAge: number) =>
    chosen !== null && chosen > earliestPensionStartAge(retirementAge) ? chosen : null;
  return {
    ...profile,
    personal: {
      ...profile.personal,
      retirementAge: values.retirementAge,
      pensionStartAge: savedStart(values.pensionStartAge, values.retirementAge),
    },
    spouse:
      couple && values.spouseRetirementAge !== null
        ? {
            ...profile.spouse,
            retirementAge: values.spouseRetirementAge,
            pensionStartAge: savedStart(values.spousePensionStartAge, values.spouseRetirementAge),
          }
        : profile.spouse,
    assumptions: {
      ...profile.assumptions,
      investmentReturnPct: values.investmentReturnPct,
      inflationPct: values.inflationPct,
      planningHorizonAge: values.planningHorizonAge,
    },
    expenses: withSpending(profile.expenses, values.monthlySpending),
    equity: {
      ...profile.equity,
      usdToIlsRate:
        values.dollarChangePct === 0
          ? profile.equity.usdToIlsRate
          : usdToIlsRate(profile) * (1 + values.dollarChangePct / 100),
      holdings,
    },
  };
}

/** The parts of the profile that "Apply to my plan" saves: the plan's own values, never a market move. */
export function whatIfPlanPatch(
  profile: ProfileData,
  values: WhatIfValues,
): Pick<ProfileData, "personal" | "spouse" | "assumptions" | "expenses"> {
  const applied = applyWhatIf(profile, { ...values, sharesChangePct: 0, dollarChangePct: 0 });
  return {
    personal: applied.personal,
    spouse: applied.spouse,
    assumptions: applied.assumptions,
    expenses: applied.expenses,
  };
}

/** What a set of values means for the household, at the plan's own retirement ages. */
export interface WhatIfOutcome {
  /** Monthly income by source and age that the savings can sustain to the horizon. */
  income: IncomeBreakdownPoint[];
  /** The planned spending paid year by year; null when no spending is planned. */
  cashFlow: CashFlowPlan | null;
  /** The lowest after-tax monthly income of any retirement year. */
  netMonthlyIncome: number;
  monthlySpending: number;
  /** Net income minus planned spending; null when no spending is planned. */
  monthlyGap: number | null;
  /** The primary user's age when the savings stop covering the planned spending; null when they last. */
  runsOutAge: number | null;
  horizonAge: number;
  /** Savings when the household starts drawing, today's money. */
  netWorthAtRetirement: number;
}

export function evaluateWhatIf(profile: ProfileData): WhatIfOutcome {
  const household = buildHousehold(profile, resolveRetirementTiming(profile, "standard"));
  const funding = projectSpendingFunding(profile, "standard");
  const net = estimateNetIncome(profile, "standard");
  const monthlySpending = funding.monthlySpending;
  return {
    income: estimateIncomeBreakdown(profile, "standard"),
    cashFlow: projectCashFlow(profile, "standard"),
    netMonthlyIncome: net.netMonthlyIncome,
    monthlySpending,
    monthlyGap: monthlySpending > 0 ? Math.round(net.netMonthlyIncome - monthlySpending) : null,
    runsOutAge: funding.shortfallAge,
    horizonAge: funding.horizonAge,
    netWorthAtRetirement: Math.round(estimateHouseholdRetirementIncome(household).netWorthAtRetirement),
  };
}

/**
 * The one number the sensitivity view and the age grid compare: the gap between the lowest net
 * monthly income and the planned spending, or the income itself when no spending is planned.
 */
export function whatIfMargin(profile: ProfileData): number {
  const net = estimateNetIncome(profile, "standard").netMonthlyIncome;
  const spending = desiredRetirementMonthly(profile.expenses) ?? 0;
  return Math.round(spending > 0 ? net - spending : net);
}

export type SensitivityKey = WhatIfSliderKey;

export interface SensitivitySide {
  /** The value tested. */
  value: number;
  /** How the margin moves from the draft's, per month. */
  delta: number;
}

export interface SensitivityRow {
  key: SensitivityKey;
  /** The draft value moved down; null when the slider's range stops it. */
  down: SensitivitySide | null;
  up: SensitivitySide | null;
  /** The larger of the two moves, for ordering. */
  swing: number;
}

/** The distance each parameter is moved either way. */
export const SENSITIVITY_STEPS: Record<WhatIfSliderKey, number> = {
  retirementAge: 2,
  spouseRetirementAge: 2,
  pensionStartAge: 2,
  spousePensionStartAge: 2,
  investmentReturnPct: 1,
  inflationPct: 1,
  monthlySpending: 10,
  sharesChangePct: 20,
  dollarChangePct: 10,
};

export const hasDollarHoldings = (profile: ProfileData) =>
  profile.equity.holdings.some((holding) => (holding.currentMarketPriceUSD ?? 0) > 0 && (holding.quantity ?? 0) > 0);

/** The sliders worth testing for this plan: no spouse, spending or share sliders when there is nothing for them to move. */
export function sensitivityKeys(profile: ProfileData, values: WhatIfValues): SensitivityKey[] {
  const couple = isHouseholdActive(profile);
  const keys: SensitivityKey[] = ["retirementAge"];
  if (couple) keys.push("spouseRetirementAge");
  if (canChoosePensionStart(profile, "self")) keys.push("pensionStartAge");
  if (couple && canChoosePensionStart(profile, "spouse")) keys.push("spousePensionStartAge");
  keys.push("investmentReturnPct", "inflationPct");
  if (values.monthlySpending > 0) keys.push("monthlySpending");
  if (hasDollarHoldings(profile)) keys.push("sharesChangePct", "dollarChangePct");
  return keys;
}

function testedValue(
  key: SensitivityKey,
  values: WhatIfValues,
  direction: 1 | -1,
  limits: WhatIfRange,
): number | null {
  const current = isPensionStartKey(key) ? pensionStartOf(values, key) : (values[key] ?? 0);
  const distance =
    key === "monthlySpending"
      ? Math.max(Math.round((current * SENSITIVITY_STEPS[key]) / 100 / limits.step) * limits.step, limits.step)
      : SENSITIVITY_STEPS[key];
  const target = roundTo(Math.min(Math.max(current + direction * distance, limits.min), limits.max));
  return target === current ? null : target;
}

/**
 * Moves each parameter a fixed distance either way from the draft, one at a time, and reports how
 * the monthly margin changes: which assumptions the plan depends on most. The rows are ordered
 * by the larger move.
 */
export function whatIfSensitivity(profile: ProfileData, values: WhatIfValues): SensitivityRow[] {
  const ranges = whatIfRanges(profile, values);
  const centre = whatIfMargin(applyWhatIf(profile, values));
  const side = (key: SensitivityKey, direction: 1 | -1): SensitivitySide | null => {
    const value = testedValue(key, values, direction, ranges[key]);
    if (value === null) return null;
    return { value, delta: whatIfMargin(applyWhatIf(profile, { ...values, [key]: value })) - centre };
  };
  return sensitivityKeys(profile, values)
    .map((key) => {
      const down = side(key, -1);
      const up = side(key, 1);
      return { key, down, up, swing: Math.max(Math.abs(down?.delta ?? 0), Math.abs(up?.delta ?? 0)) };
    })
    .sort((a, b) => b.swing - a.swing);
}

/** What the grid's columns vary, against the retirement age down its rows. */
export type AgeGridColumn = "investmentReturnPct" | "monthlySpending" | "spouseRetirementAge";

export interface AgeGrid {
  column: AgeGridColumn;
  /** The primary user's retirement ages, one per row. */
  rows: number[];
  /** The column values. */
  columns: number[];
  /** The margin per month at each row and column. */
  cells: number[][];
}

const GRID_ROW_STEP = 2;
const GRID_ROW_REACH = 3;
const GRID_COLUMN_REACH = 2;

const GRID_COLUMN_STEP: Record<AgeGridColumn, (values: WhatIfValues, limits: WhatIfRange) => number> = {
  investmentReturnPct: () => 1,
  spouseRetirementAge: () => 2,
  monthlySpending: (values, limits) =>
    Math.max(Math.round((values.monthlySpending * 0.1) / limits.step) * limits.step, limits.step),
};

/** The grid columns that make sense for this plan. */
export function ageGridColumns(profile: ProfileData): AgeGridColumn[] {
  const columns: AgeGridColumn[] = ["investmentReturnPct"];
  if (baselineWhatIf(profile).monthlySpending > 0) columns.push("monthlySpending");
  if (isHouseholdActive(profile)) columns.push("spouseRetirementAge");
  return columns;
}

/**
 * The margin for a range of retirement ages against one other parameter, each cell a full run of
 * the plan with the draft's other values. Ages and values outside the sliders' ranges are left
 * out, and the draft's own age and value are always included when the sliders allow them.
 */
export function buildAgeGrid(profile: ProfileData, values: WhatIfValues, column: AgeGridColumn): AgeGrid {
  const ranges = whatIfRanges(profile);
  const within = (candidate: number, limits: WhatIfRange) => candidate >= limits.min && candidate <= limits.max;
  const spread = (centre: number, step: number, reach: number, limits: WhatIfRange) =>
    Array.from({ length: reach * 2 + 1 }, (_unused, index) => roundTo(centre + (index - reach) * step)).filter(
      (candidate) => within(candidate, limits),
    );

  const rows = spread(values.retirementAge, GRID_ROW_STEP, GRID_ROW_REACH, ranges.retirementAge);
  const columns = spread(
    values[column] ?? 0,
    GRID_COLUMN_STEP[column](values, ranges[column]),
    GRID_COLUMN_REACH,
    ranges[column],
  );
  const cells = rows.map((row) =>
    columns.map((value) =>
      whatIfMargin(applyWhatIf(profile, { ...values, retirementAge: row, [column]: value })),
    ),
  );
  return { column, rows, columns, cells };
}
