import {
  ACCOUNT_FIELD_KEYS,
  defaultSelectedFields,
  diffField,
  type AccountFieldKey,
  type FieldDiff,
  type ImportConfidence,
  type ImportedAccountCandidate,
  type ImportedFieldValues,
  type ImportedValue,
  type ImportPlan,
  type ImportReportInfo,
  type ImportWarning,
  type PersonalFieldKey,
  type PersonalSuggestions,
  WARNING_SEVERITY,
} from "../../domain/clearingHouseImport";
import { suggestedRetirementAge } from "../../domain/bituachLeumi";
import { DEFAULT_RETIREMENT_AGE } from "../../domain/constants";
import type { AccountOwner, Gender, MaritalStatus, PensionAccount, ProfileData } from "../../types";

export type PersonalValue = Gender | MaritalStatus | number;

export interface AccountReviewState {
  include: boolean;
  /** Existing account to update, or null to add a new one. */
  updateAccountId: string | null;
  selected: AccountFieldKey[];
}

export function initialAccountState(
  candidate: ImportedAccountCandidate,
  existing: PensionAccount | null,
): AccountReviewState {
  const selected = defaultSelectedFields(candidate, existing);
  return { include: selected.length > 0, updateAccountId: existing?.id ?? null, selected };
}

type FieldValue = ImportedFieldValues[AccountFieldKey];

/** One value of a report account as the review lists it. */
export interface AccountValueRow {
  key: AccountFieldKey;
  imported: ImportedValue<FieldValue>;
  diff: FieldDiff;
  /** Worth a look before importing: it would replace a value the profile holds, or it is an interpretation. */
  attention: boolean;
}

export function needsAttention(confidence: ImportConfidence, diff: FieldDiff): boolean {
  return diff !== "same" && (diff === "differs" || confidence === "uncertain");
}

/** The values the report holds for an account, in display order, against what the profile already has. */
export function accountValueRows(
  candidate: ImportedAccountCandidate,
  existing: PensionAccount | null,
): AccountValueRow[] {
  return ACCOUNT_FIELD_KEYS.flatMap((key) => {
    const imported = candidate.fields[key] as ImportedValue<FieldValue> | undefined;
    if (!imported) return [];
    const diff = diffField(existing, key, imported.value);
    return [{ key, imported, diff, attention: needsAttention(imported.confidence, diff) }];
  });
}

/** A value identical to the profile's cannot be ticked, so it never counts as selectable. */
export function selectableKeys(rows: AccountValueRow[]): AccountFieldKey[] {
  return rows.filter((row) => row.diff !== "same").map((row) => row.key);
}

export function candidateBalance(candidate: ImportedAccountCandidate): number | null {
  return candidate.fields.totalAccumulatedBalance?.value ?? null;
}

/** Notes the user should read, as opposed to ones that only explain how the report was read. */
export function countWarnings(candidates: ImportedAccountCandidate[], reportWarnings: ImportWarning[]): number {
  const all = [...reportWarnings, ...candidates.flatMap((candidate) => candidate.warnings)];
  return all.filter((warning) => WARNING_SEVERITY[warning.code] === "warning").length;
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

/**
 * The retirement age the report's figures are compared with: the one entered, else the statutory age for the
 * person's gender and age (from the profile, or failing that from the report), else the default.
 */
export function targetRetirementAge(
  profile: ProfileData,
  owner: AccountOwner,
  personal: PersonalSuggestions = {},
): number {
  const person = owner === "self" ? profile.personal : profile.spouse;
  return (
    person.retirementAge ??
    suggestedRetirementAge(person.gender ?? personal.gender?.value ?? null, person.age ?? personal.age?.value ?? null) ??
    DEFAULT_RETIREMENT_AGE
  );
}

export function buildImportPlan(
  owner: AccountOwner,
  candidates: ImportedAccountCandidate[],
  states: Record<string, AccountReviewState>,
  personal: PersonalSuggestions,
  selectedPersonal: PersonalFieldKey[],
  report: ImportReportInfo | null = null,
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
    report,
  };
}

export function countPlan(plan: ImportPlan): { accounts: number; personal: number; values: number } {
  const accounts = plan.accounts.filter((choice) => choice.selectedFields.length > 0);
  const personal = plan.selectedPersonal.filter((key) => plan.personal[key] !== undefined);
  const values = accounts.reduce((sum, choice) => sum + choice.selectedFields.length, 0) + personal.length;
  return { accounts: accounts.length, personal: personal.length, values };
}
