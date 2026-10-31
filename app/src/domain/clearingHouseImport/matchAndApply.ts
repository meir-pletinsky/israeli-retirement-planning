import type { AccountOwner, ImportedReport, PensionAccount, ProfileData } from "../../types";
import { createEmptyPensionAccount, createId } from "../../types";
import { sameIdNumber } from "./israeliId";
import { sharesKey } from "./reportPeople";
import {
  ACCOUNT_FIELD_KEYS,
  type AccountFieldKey,
  type ImportedAccountCandidate,
  type ImportedFieldValues,
  type PersonalSuggestions,
  type ReportMapResult,
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
    case "hasGuaranteedFactor":
      // The unticked box is the form's default, so it counts as empty.
      return account.annuityParameters.hasGuaranteedFactor ? true : null;
    case "conversionFactor":
      return account.annuityParameters.conversionFactor;
    case "estimatedMonthlyAnnuity":
      return account.annuityParameters.estimatedMonthlyAnnuity;
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
    case "hasGuaranteedFactor":
      return { ...account, annuityParameters: { ...account.annuityParameters, hasGuaranteedFactor: v as boolean } };
    case "conversionFactor":
      return { ...account, annuityParameters: { ...account.annuityParameters, conversionFactor: v as number } };
    case "estimatedMonthlyAnnuity":
      return { ...account, annuityParameters: { ...account.annuityParameters, estimatedMonthlyAnnuity: v as number } };
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
    const category = candidate.fields.productCategory?.value;
    const digits = number.replace(/\D/g, "").replace(/^0+/, "");
    const sharedNumber = candidate.warnings.some((warning) => warning.code === "policyNumberIsHolderId");
    if (sharedNumber) {
      // The holder's ID is on every new pension fund, so it only counts with the same provider and kind.
      const twins = candidates.filter(
        (other) =>
          other.warnings.some((warning) => warning.code === "policyNumberIsHolderId") &&
          other.fields.productCategory?.value === category &&
          sameProvider(other.fields.providerName?.value ?? "", provider),
      );
      if (twins.length !== 1) continue;
    }
    const found = pool.find(
      (account) =>
        !used.has(account.id) &&
        sameIdNumber(account.policyNumber, number) &&
        (sharedNumber
          ? account.productCategory === category && sameProvider(account.providerName, provider)
          : sameProvider(account.providerName, provider) || digits.length >= MIN_DISTINCTIVE_POLICY_DIGITS),
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

/** What is kept about the report an import came from; see `ImportedReport`. */
export type ImportReportInfo = Omit<ImportedReport, "id" | "owner">;

export interface ImportPlan {
  owner: AccountOwner;
  accounts: ImportAccountChoice[];
  personal: PersonalSuggestions;
  selectedPersonal: PersonalFieldKey[];
  /** Recorded with the import so accounts can say where they came from; left out, nothing is recorded. */
  report?: ImportReportInfo | null;
}

function isoDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The record of a report that is about to be imported. Only the first name, the age and the
 * one-way fingerprints are kept; the sample is never fingerprinted because it is nobody's.
 */
export function reportInfoFor(result: ReportMapResult, importedAt: Date, sample: boolean): ImportReportInfo {
  const person = result.people[0] ?? null;
  const dates = result.candidates.flatMap((candidate) => (candidate.valuationDate ? [candidate.valuationDate] : []));
  return {
    personKeys: sample ? [] : [...new Set(result.people.flatMap((entry) => entry.keys))],
    firstName: person?.firstName ?? null,
    ageAtImport: person?.age ?? result.personal.age?.value ?? null,
    reportDate: dates.length > 0 ? dates.reduce((newest, date) => (date > newest ? date : newest)) : null,
    importedAt: isoDay(importedAt),
    sample,
  };
}

/**
 * Adds the new record and drops the earlier ones it replaces: reports of the same kind that no
 * account points at any more and that are either about the same person under the same owner or
 * cannot be recognised again anyway.
 */
function withRecordedReport(
  reports: ImportedReport[],
  record: ImportedReport,
  accounts: PensionAccount[],
): ImportedReport[] {
  const referenced = new Set(accounts.map((account) => account.reportId));
  const superseded = (report: ImportedReport) =>
    !referenced.has(report.id) &&
    report.sample === record.sample &&
    (report.personKeys.length === 0 || (report.owner === record.owner && sharesKey(report.personKeys, record.personKeys)));
  return [...reports.filter((report) => !superseded(report)), record];
}

/** The profile changes for an import plan; nothing is written until the caller applies the patch. */
export function applyImport(profile: ProfileData, plan: ImportPlan): Partial<ProfileData> {
  const byId = new Map(profile.pensionSavings.accounts.map((account) => [account.id, account]));
  const updates = new Map<string, PensionAccount>();
  const additions: PensionAccount[] = [];
  const record: ImportedReport | null = plan.report ? { ...plan.report, id: createId(), owner: plan.owner } : null;

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
    if (record) account = { ...account, reportId: record.id };
    if (choice.updateAccountId) updates.set(choice.updateAccountId, account);
    else additions.push(account);
  }

  const patch: Partial<ProfileData> = {};
  const picked = (key: PersonalFieldKey) => plan.selectedPersonal.includes(key) && plan.personal[key] !== undefined;
  const writesAccounts = updates.size > 0 || additions.length > 0;
  if (writesAccounts || (record && plan.selectedPersonal.some(picked))) {
    const accounts = [
      ...profile.pensionSavings.accounts.map((account) => updates.get(account.id) ?? account),
      ...additions,
    ];
    patch.pensionSavings = {
      ...profile.pensionSavings,
      accounts,
      reports: record ? withRecordedReport(profile.pensionSavings.reports, record, accounts) : profile.pensionSavings.reports,
    };
  }

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
