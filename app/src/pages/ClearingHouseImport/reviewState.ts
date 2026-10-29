import {
  defaultSelectedFields,
  type AccountFieldKey,
  type ImportedAccountCandidate,
  type ImportedValue,
  type ImportPlan,
  type PersonalFieldKey,
  type PersonalSuggestions,
  type ReportProjection,
} from "../../domain/clearingHouseImport";
import type { AccountOwner, Gender, MaritalStatus, PensionAccount, ProfileData } from "../../types";

export type PersonalValue = Gender | MaritalStatus | number;

export interface AccountReviewState {
  include: boolean;
  /** Existing account to update, or null to add a new one. */
  updateAccountId: string | null;
  selected: AccountFieldKey[];
}

const DEFAULT_RETIREMENT_AGE = 67;

export function initialAccountState(
  candidate: ImportedAccountCandidate,
  existing: PensionAccount | null,
): AccountReviewState {
  const selected = defaultSelectedFields(candidate, existing);
  return { include: selected.length > 0, updateAccountId: existing?.id ?? null, selected };
}

export function personalKeysFor(owner: AccountOwner): PersonalFieldKey[] {
  return owner === "self"
    ? ["gender", "maritalStatus", "age", "monthlyGrossSalary"]
    : ["gender", "age", "monthlyGrossSalary"];
}

export function currentPersonalValue(
  profile: ProfileData,
  owner: AccountOwner,
  key: PersonalFieldKey,
): PersonalValue | null {
  if (owner === "self") return profile.personal[key];
  if (key === "maritalStatus") return null;
  return profile.spouse[key];
}

export type PersonalDiff = "fillsEmpty" | "same" | "differs";

export function personalDiff(current: PersonalValue | null, incoming: PersonalValue): PersonalDiff {
  if (current === null || current === undefined) return "fillsEmpty";
  if (typeof current === "number" && typeof incoming === "number") {
    return Math.abs(current - incoming) < 0.5 ? "same" : "differs";
  }
  return current === incoming ? "same" : "differs";
}

export interface PersonalSuggestionRow {
  key: PersonalFieldKey;
  imported: ImportedValue<PersonalValue>;
}

export function suggestedPersonal(personal: PersonalSuggestions, owner: AccountOwner): PersonalSuggestionRow[] {
  const rows: PersonalSuggestionRow[] = [];
  for (const key of personalKeysFor(owner)) {
    const imported = personal[key];
    if (imported) rows.push({ key, imported });
  }
  return rows;
}

/** Certain values that fill an empty profile field start ticked; the rest start unticked. */
export function defaultSelectedPersonal(
  personal: PersonalSuggestions,
  profile: ProfileData,
  owner: AccountOwner,
): PersonalFieldKey[] {
  return suggestedPersonal(personal, owner)
    .filter(
      ({ key, imported }) =>
        imported.confidence !== "uncertain" &&
        personalDiff(currentPersonalValue(profile, owner, key), imported.value) === "fillsEmpty",
    )
    .map(({ key }) => key);
}

export function targetRetirementAge(profile: ProfileData, owner: AccountOwner): number {
  const age = owner === "self" ? profile.personal.retirementAge : profile.spouse.retirementAge;
  return age ?? DEFAULT_RETIREMENT_AGE;
}

function hasFigure(projection: ReportProjection): boolean {
  return (projection.accumulation ?? 0) > 0 || (projection.monthlyPension ?? 0) > 0;
}

/** The report's projection closest to the user's retirement age, among those that carry a positive figure. */
export function nearestProjection(projections: ReportProjection[], targetAge: number): ReportProjection | null {
  let best: ReportProjection | null = null;
  for (const projection of projections) {
    if (!hasFigure(projection)) continue;
    if (best === null || Math.abs(projection.age - targetAge) < Math.abs(best.age - targetAge)) {
      best = projection;
    }
  }
  return best;
}

export function buildImportPlan(
  owner: AccountOwner,
  candidates: ImportedAccountCandidate[],
  states: Record<string, AccountReviewState>,
  personal: PersonalSuggestions,
  selectedPersonal: PersonalFieldKey[],
): ImportPlan {
  return {
    owner,
    accounts: candidates.flatMap((candidate) => {
      const state = states[candidate.key];
      if (!state?.include) return [];
      return [{ candidate, updateAccountId: state.updateAccountId, selectedFields: state.selected }];
    }),
    personal,
    selectedPersonal,
  };
}

export function countPlan(plan: ImportPlan): { accounts: number; personal: number; values: number } {
  const accounts = plan.accounts.filter((choice) => choice.selectedFields.length > 0);
  const personal = plan.selectedPersonal.filter((key) => plan.personal[key] !== undefined);
  const values = accounts.reduce((sum, choice) => sum + choice.selectedFields.length, 0) + personal.length;
  return { accounts: accounts.length, personal: personal.length, values };
}
