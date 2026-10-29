import type { AccountOwner, PensionAccount, ProfileData } from "../../types";
import { createEmptyPensionAccount } from "../../types";
import { sameIdNumber } from "./israeliId";
import {
  ACCOUNT_FIELD_KEYS,
  type AccountFieldKey,
  type ImportedAccountCandidate,
  type ImportedFieldValues,
  type PersonalSuggestions,
} from "./types";

type FieldValue = ImportedFieldValues[AccountFieldKey];

export function readField(account: PensionAccount, key: AccountFieldKey): FieldValue | null {
  switch (key) {
    case "providerName":
      return account.providerName || null;
    case "policyNumber":
      return account.policyNumber || null;
    case "productCategory":
      return account.productCategory;
    case "legacyPolicyModel":
      return account.legacyPolicyModel;
    case "accountStatus":
      return account.accountStatus;
    case "joinDate":
      return account.joinDate;
    case "liquidityDate":
      return account.liquidityDate;
    case "totalAccumulatedBalance":
      return account.totalAccumulatedBalance;
    case "monthlySalaryBase":
      return account.contributions.monthlySalaryBase;
    case "employeeRatePercent":
      return account.contributions.employeeRatePercent;
    case "employerRatePercent":
      return account.contributions.employerRatePercent;
    case "severanceRatePercent":
      return account.contributions.severanceRatePercent;
    case "severanceBalance":
      return account.balanceBreakdown.severanceBalance;
    case "deathCoverageAmount":
      return account.insuranceCoverages.deathCoverageAmount;
    case "monthlyDisabilityAmount":
      return account.insuranceCoverages.monthlyDisabilityAmount;
    case "monthlyRiskDeduction":
      return account.insuranceCoverages.monthlyRiskDeduction;
    case "investmentTrackName":
      return account.investmentAndFees.investmentTrackName || null;
    case "feeFromAccumulationPercent":
      return account.investmentAndFees.feeFromAccumulationPercent;
    case "feeFromDepositPercent":
      return account.investmentAndFees.feeFromDepositPercent;
  }
}

export function writeField<K extends AccountFieldKey>(
  account: PensionAccount,
  key: K,
  value: ImportedFieldValues[K],
): PensionAccount {
  const v = value as FieldValue;
  switch (key) {
    case "providerName":
      return { ...account, providerName: v as string };
    case "policyNumber":
      return { ...account, policyNumber: v as string };
    case "productCategory":
      return { ...account, productCategory: v as PensionAccount["productCategory"] };
    case "legacyPolicyModel":
      return { ...account, legacyPolicyModel: v as PensionAccount["legacyPolicyModel"] };
    case "accountStatus":
      return { ...account, accountStatus: v as PensionAccount["accountStatus"] };
    case "joinDate":
      return { ...account, joinDate: v as string };
    case "liquidityDate":
      return { ...account, liquidityDate: v as string };
    case "totalAccumulatedBalance":
      return { ...account, totalAccumulatedBalance: v as number };
    case "monthlySalaryBase":
      return { ...account, contributions: { ...account.contributions, monthlySalaryBase: v as number } };
    case "employeeRatePercent":
      return { ...account, contributions: { ...account.contributions, employeeRatePercent: v as number } };
    case "employerRatePercent":
      return { ...account, contributions: { ...account.contributions, employerRatePercent: v as number } };
    case "severanceRatePercent":
      return { ...account, contributions: { ...account.contributions, severanceRatePercent: v as number } };
    case "severanceBalance":
      return { ...account, balanceBreakdown: { ...account.balanceBreakdown, severanceBalance: v as number } };
    case "deathCoverageAmount":
      return { ...account, insuranceCoverages: { ...account.insuranceCoverages, deathCoverageAmount: v as number } };
    case "monthlyDisabilityAmount":
      return {
        ...account,
        insuranceCoverages: { ...account.insuranceCoverages, monthlyDisabilityAmount: v as number },
      };
    case "monthlyRiskDeduction":
      return { ...account, insuranceCoverages: { ...account.insuranceCoverages, monthlyRiskDeduction: v as number } };
    case "investmentTrackName":
      return { ...account, investmentAndFees: { ...account.investmentAndFees, investmentTrackName: v as string } };
    case "feeFromAccumulationPercent":
      return {
        ...account,
        investmentAndFees: { ...account.investmentAndFees, feeFromAccumulationPercent: v as number },
      };
    case "feeFromDepositPercent":
      return {
        ...account,
        investmentAndFees: { ...account.investmentAndFees, feeFromDepositPercent: v as number },
      };
  }
}

/** How an imported value relates to what the profile already holds. */
export type FieldDiff = "new" | "fillsEmpty" | "same" | "differs";

export function diffField(existing: PensionAccount | null, key: AccountFieldKey, incoming: FieldValue): FieldDiff {
  if (!existing) return "new";
  const current = readField(existing, key);
  if (current === null || current === undefined || current === "") return "fillsEmpty";
  if (typeof current === "number" && typeof incoming === "number") {
    return Math.abs(current - incoming) < 0.005 ? "same" : "differs";
  }
  return current === incoming ? "same" : "differs";
}

/**
 * Starting selection for the review screen: certain values that add information are ticked;
 * interpretations, unchanged values and values that would overwrite the user's own are not.
 */
export function defaultSelectedFields(
  candidate: ImportedAccountCandidate,
  existing: PensionAccount | null,
): AccountFieldKey[] {
  return ACCOUNT_FIELD_KEYS.filter((key) => {
    const imported = candidate.fields[key];
    if (!imported || imported.confidence === "uncertain") return false;
    const diff = diffField(existing, key, imported.value);
    return diff === "new" || diff === "fillsEmpty";
  });
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/["'`״׳.,\-()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameProvider(a: string, b: string): boolean {
  const left = normalizeName(a);
  return left !== "" && left === normalizeName(b);
}

const MIN_DISTINCTIVE_POLICY_DIGITS = 6;

/**
 * Pairs each candidate with at most one of the owner's existing accounts.
 * Returns a map from candidate key to account id; unmatched candidates are absent.
 */
export function matchCandidates(
  candidates: ImportedAccountCandidate[],
  accounts: PensionAccount[],
  owner: AccountOwner,
): Map<string, string> {
  const pool = accounts.filter((account) => account.owner === owner);
  const matches = new Map<string, string>();
  const used = new Set<string>();

  for (const candidate of candidates) {
    const number = candidate.fields.policyNumber?.value;
    if (!number) continue;
    const provider = candidate.fields.providerName?.value ?? "";
    const digits = number.replace(/\D/g, "").replace(/^0+/, "");
    const found = pool.find(
      (account) =>
        !used.has(account.id) &&
        sameIdNumber(account.policyNumber, number) &&
        (sameProvider(account.providerName, provider) || digits.length >= MIN_DISTINCTIVE_POLICY_DIGITS),
    );
    if (found) {
      matches.set(candidate.key, found.id);
      used.add(found.id);
    }
  }

  const open = candidates.filter((candidate) => !matches.has(candidate.key));
  for (const candidate of open) {
    const provider = candidate.fields.providerName?.value;
    const category = candidate.fields.productCategory?.value;
    if (!provider || !category) continue;
    const sameKind = (account: PensionAccount) =>
      sameProvider(account.providerName, provider) && account.productCategory === category;
    const rivals = open.filter(
      (other) =>
        other.fields.productCategory?.value === category &&
        other.fields.providerName?.value !== undefined &&
        sameProvider(provider, other.fields.providerName.value),
    );
    const fits = pool.filter((account) => !used.has(account.id) && account.policyNumber === "" && sameKind(account));
    if (rivals.length === 1 && fits.length === 1) {
      matches.set(candidate.key, fits[0].id);
      used.add(fits[0].id);
    }
  }
  return matches;
}

export type PersonalFieldKey = keyof PersonalSuggestions;

export interface ImportAccountChoice {
  candidate: ImportedAccountCandidate;
  /** Existing account to update, or null to add a new one. */
  updateAccountId: string | null;
  selectedFields: AccountFieldKey[];
}

export interface ImportPlan {
  owner: AccountOwner;
  accounts: ImportAccountChoice[];
  personal: PersonalSuggestions;
  selectedPersonal: PersonalFieldKey[];
}

/** The profile changes for an import plan; nothing is written until the caller applies the patch. */
export function applyImport(profile: ProfileData, plan: ImportPlan): Partial<ProfileData> {
  const byId = new Map(profile.pensionSavings.accounts.map((account) => [account.id, account]));
  const updates = new Map<string, PensionAccount>();
  const additions: PensionAccount[] = [];

  for (const choice of plan.accounts) {
    if (choice.selectedFields.length === 0) continue;
    const base = choice.updateAccountId
      ? (updates.get(choice.updateAccountId) ?? byId.get(choice.updateAccountId))
      : { ...createEmptyPensionAccount(), owner: plan.owner };
    if (!base) continue;
    let account: PensionAccount = base;
    for (const key of choice.selectedFields) {
      const imported = choice.candidate.fields[key];
      if (imported) account = writeField(account, key, imported.value as never);
    }
    if (choice.updateAccountId) updates.set(choice.updateAccountId, account);
    else additions.push(account);
  }

  const patch: Partial<ProfileData> = {};
  if (updates.size > 0 || additions.length > 0) {
    patch.pensionSavings = {
      ...profile.pensionSavings,
      accounts: [...profile.pensionSavings.accounts.map((account) => updates.get(account.id) ?? account), ...additions],
    };
  }

  const picked = (key: PersonalFieldKey) => plan.selectedPersonal.includes(key) && plan.personal[key] !== undefined;
  if (plan.owner === "self") {
    const personal = { ...profile.personal };
    if (picked("gender")) personal.gender = plan.personal.gender!.value;
    if (picked("maritalStatus")) personal.maritalStatus = plan.personal.maritalStatus!.value;
    if (picked("age")) personal.age = plan.personal.age!.value;
    if (picked("monthlyGrossSalary")) personal.monthlyGrossSalary = plan.personal.monthlyGrossSalary!.value;
    patch.personal = personal;
  } else {
    const spouse = { ...profile.spouse };
    if (picked("gender")) spouse.gender = plan.personal.gender!.value;
    if (picked("age")) spouse.age = plan.personal.age!.value;
    if (picked("monthlyGrossSalary")) spouse.monthlyGrossSalary = plan.personal.monthlyGrossSalary!.value;
    patch.spouse = spouse;
  }
  return patch;
}
