import {
  PLANNING_HORIZON_AGES,
  WITHDRAWAL_MIX_KEYS,
  WITHDRAWAL_STRATEGIES,
  hasProfileData,
  normalizeWithdrawalMix,
  type PlanningHorizonAge,
  type ProfileData,
  type WithdrawalStrategy,
} from "../types";
import {
  type AgeGridColumn,
  type WhatIfOverrides,
  type WhatIfRange,
  type WhatIfValues,
  baselineWhatIf,
  sameWhatIfValue,
  whatIfRanges,
  whatIfValues,
} from "./whatIf";

export const WHAT_IF_BASES = ["planned", "sustainable"] as const;

/** What the chart measures income against: the planned spending, or what the savings can sustain. */
export type WhatIfBasis = (typeof WHAT_IF_BASES)[number];

const AGE_GRID_COLUMNS: readonly AgeGridColumn[] = ["investmentReturnPct", "monthlySpending", "spouseRetirementAge"];

/**
 * What the What if tab keeps between visits, apart from the saved plan: the values moved away from
 * the plan, and the two view choices that go with them.
 */
export interface WhatIfDraft {
  overrides: WhatIfOverrides;
  basis: WhatIfBasis;
  column: AgeGridColumn;
}

export const EMPTY_WHAT_IF_DRAFT: WhatIfDraft = {
  overrides: {},
  basis: "planned",
  column: "investmentReturnPct",
};

export const isEmptyWhatIfDraft = (draft: WhatIfDraft) =>
  draft.basis === EMPTY_WHAT_IF_DRAFT.basis &&
  draft.column === EMPTY_WHAT_IF_DRAFT.column &&
  Object.keys(draft.overrides).length === 0;

type NumberKey =
  | "retirementAge"
  | "spouseRetirementAge"
  | "investmentReturnPct"
  | "inflationPct"
  | "monthlySpending"
  | "sharesChangePct"
  | "dollarChangePct"
  | "incomeCapPct";

const NUMBER_KEYS: readonly NumberKey[] = [
  "retirementAge",
  "spouseRetirementAge",
  "investmentReturnPct",
  "inflationPct",
  "monthlySpending",
  "sharesChangePct",
  "dollarChangePct",
  "incomeCapPct",
];

const PENSION_KEYS = ["pensionStartAge", "spousePensionStartAge"] as const;

/** Every override key, in the order a draft is written, so an unchanged draft compares equal as text. */
const OVERRIDE_KEYS: readonly (keyof WhatIfValues)[] = [
  "retirementAge",
  "spouseRetirementAge",
  "pensionStartAge",
  "spousePensionStartAge",
  "investmentReturnPct",
  "inflationPct",
  "monthlySpending",
  "sharesChangePct",
  "dollarChangePct",
  "planningHorizonAge",
  "incomeCapPct",
  "withdrawalStrategy",
  "withdrawalMix",
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const clamp = (value: number, { min, max }: WhatIfRange) => Math.min(Math.max(value, min), max);

/**
 * Reads a saved or imported draft against the plan it is to be laid over. The plan may have
 * changed since the draft was written, so anything that no longer fits is dropped or pulled back
 * into range: unknown keys, wrong types, values outside the sliders' reach, the spouse's values
 * when the plan covers one person, and values that now equal the plan. A draft that needs no
 * change is returned as it is.
 */
export function readWhatIfDraft(raw: unknown, profile: ProfileData): WhatIfDraft {
  const read = hasProfileData(profile) ? buildDraft(isRecord(raw) ? raw : {}, profile) : EMPTY_WHAT_IF_DRAFT;
  return isRecord(raw) && JSON.stringify(raw) === JSON.stringify(read) ? (raw as unknown as WhatIfDraft) : read;
}

function buildDraft(saved: Record<string, unknown>, profile: ProfileData): WhatIfDraft {
  const base = baselineWhatIf(profile);
  const couple = base.spouseRetirementAge !== null;
  const stored = isRecord(saved.overrides) ? saved.overrides : {};
  const picked: WhatIfOverrides = {};

  const ownRanges = whatIfRanges(profile);
  for (const key of NUMBER_KEYS) {
    const value = stored[key];
    if (!isNumber(value) || (key === "spouseRetirementAge" && !couple)) continue;
    picked[key] = clamp(value, ownRanges[key]);
  }

  // A pension start range follows the retirement ages, so it is read once they are known.
  const ranges = whatIfRanges(profile, whatIfValues(profile, picked));
  for (const key of PENSION_KEYS) {
    const value = stored[key];
    if (key === "spousePensionStartAge" && !couple) continue;
    if (value === null) picked[key] = null;
    else if (isNumber(value)) picked[key] = clamp(value, ranges[key]);
  }

  const horizon = stored.planningHorizonAge;
  if (PLANNING_HORIZON_AGES.includes(horizon as PlanningHorizonAge)) {
    picked.planningHorizonAge = horizon as PlanningHorizonAge;
  }
  const strategy = stored.withdrawalStrategy;
  if (WITHDRAWAL_STRATEGIES.includes(strategy as WithdrawalStrategy)) {
    picked.withdrawalStrategy = strategy as WithdrawalStrategy;
  }
  const savedMix = stored.withdrawalMix;
  if (isRecord(savedMix)) {
    // normalizeWithdrawalMix answers an invalid mix with the default, which would not match what was saved.
    const mix = normalizeWithdrawalMix(savedMix);
    if (WITHDRAWAL_MIX_KEYS.every((key) => savedMix[key] === mix[key])) picked.withdrawalMix = mix;
  }

  const overrides: WhatIfOverrides = {};
  for (const key of OVERRIDE_KEYS) {
    if (!(key in picked)) continue;
    if (sameWhatIfValue(key, { ...base, ...picked }, base)) continue;
    Object.assign(overrides, { [key]: picked[key] });
  }

  return {
    overrides,
    basis: WHAT_IF_BASES.includes(saved.basis as WhatIfBasis) ? (saved.basis as WhatIfBasis) : EMPTY_WHAT_IF_DRAFT.basis,
    column: AGE_GRID_COLUMNS.includes(saved.column as AgeGridColumn)
      ? (saved.column as AgeGridColumn)
      : EMPTY_WHAT_IF_DRAFT.column,
  };
}
