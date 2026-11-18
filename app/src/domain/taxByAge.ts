import type { PensionAccount, ProductCategory, ProfileData } from "../types";
import { buildHousehold, resolveRetirementTiming, type HouseholdMember, type MemberRole } from "./household";
import { FINAL_EXEMPTION_YEAR, totalExemptionRate } from "./tax";
import {
  ratePercent,
  taxPartRules,
  TAX_BY_AGE_RULES,
  type TaxCells,
  type TaxOption,
  type TaxPartId,
  type TaxPartRule,
} from "./taxByAgeRules";

/** One way of taking one part of an account, with how it is taxed in each age band. */
export interface TaxByAgeRow {
  part: TaxPartId;
  option: TaxOption;
  cells: TaxCells;
}

export interface TaxByAgeAccount {
  id: string;
  member: MemberRole;
  category: ProductCategory;
  providerName: string;
  policyNumber: string;
  /** The owner's statutory retirement age, where the third age band starts. */
  statutoryAge: number;
  /** First illustrated payment year at or after statutory retirement; not a lifetime exemption lock. */
  exemptionYear: number;
  /** Maximum exempt share of the qualifying-annuity ceiling in that payment year, in percent. */
  exemptPercent: number;
  /** True when the balance breakdown on file told the parts apart, so parts the account does not hold are left out. */
  partsFromBreakdown: boolean;
  rows: TaxByAgeRow[];
}

export interface TaxByAge {
  asOf: string;
  accounts: TaxByAgeAccount[];
  /** Accounts left out because they have no product type, so no rule applies to them. */
  skippedAccounts: number;
  /** Where the exempt share of a qualifying annuity stops rising, for the note on accounts that reach the statutory age earlier. */
  finalExemption: { year: number; percent: number };
}

/** The breakdown has to account for nearly the whole balance before it is trusted to leave a part out. */
const BREAKDOWN_COVERAGE = 0.99;

function breakdownTotal(account: PensionAccount): number {
  return Object.values(account.balanceBreakdown).reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

/** The rules of the parts the account holds, as far as its balance breakdown can tell. */
function partsOfAccount(account: PensionAccount, rules: TaxPartRule[]): { rules: TaxPartRule[]; fromBreakdown: boolean } {
  const balance = account.totalAccumulatedBalance ?? 0;
  if (balance <= 0 || breakdownTotal(account) < balance * BREAKDOWN_COVERAGE) {
    return { rules, fromBreakdown: false };
  }
  const held = rules.filter(
    ({ breakdownFields }) =>
      breakdownFields.length === 0 || breakdownFields.some((field) => (account.balanceBreakdown[field] ?? 0) > 0),
  );
  return held.length > 0 ? { rules: held, fromBreakdown: true } : { rules, fromBreakdown: false };
}

/** Paying accounts show only annuities, retaining known tax parts when the breakdown supports them. */
function payingAnnuityRules(category: ProductCategory, rules: TaxPartRule[], fromBreakdown: boolean): TaxPartRule[] {
  if (category === "studyFund" || category === "investmentProvidentFund") return rules;
  return (fromBreakdown ? rules : rules.slice(0, 1)).map((rule) => ({
    ...rule,
    options: rule.options.filter(({ option }) => option === "annuity"),
  }));
}

function accountTaxByAge(
  account: PensionAccount,
  category: ProductCategory,
  member: HouseholdMember,
  baseYear: number,
): TaxByAgeAccount | null {
  const statutoryAge = member.bituachLeumi.statutoryRetirementAge;
  const exemptionYear = baseYear + Math.max(Math.ceil(statutoryAge - member.currentAge - 1e-9), 0);
  const exemptPercent = ratePercent(totalExemptionRate(exemptionYear));
  const all = taxPartRules(category, { exemptPercent, taxYear: exemptionYear });
  if (all.length === 0) return null;
  const { rules, fromBreakdown } = partsOfAccount(account, all);
  const held = account.accountStatus === "payingAnnuity"
    ? payingAnnuityRules(category, rules, fromBreakdown)
    : rules;
  return {
    id: account.id,
    member: member.role,
    category,
    providerName: account.providerName,
    policyNumber: account.policyNumber,
    statutoryAge,
    exemptionYear,
    exemptPercent,
    partsFromBreakdown: fromBreakdown,
    rows: held.flatMap(({ id, options }) => options.map(({ option, cells }) => ({ part: id, option, cells }))),
  };
}

/**
 * How each pension or savings account is taxed at the ages where the rules change: before 60, from
 * 60 to the owner's statutory retirement age, and from that age, for a monthly annuity and for a
 * lump sum where both exist. Every account is split into the parts that follow their own rule
 * (severance, old capital, annuity money, study-fund deposits within and above the ceiling),
 * using the balance breakdown when it covers the balance.
 *
 * Rates only, the same for everyone: the rule's exempt share, bracket range and flat rates, never
 * a personal effective rate. Read-only reference: it changes no number in the plan, and the
 * retirement scenario does not matter, so none is taken. Pass `only` to list one person's accounts.
 */
export function buildTaxByAge(profile: ProfileData, only?: MemberRole): TaxByAge {
  const household = buildHousehold(profile, resolveRetirementTiming(profile, "standard"));
  const accounts: TaxByAgeAccount[] = [];
  let skippedAccounts = 0;
  for (const member of household.members) {
    if (only && member.role !== only) continue;
    for (const account of member.profile.pensionSavings.accounts) {
      const built = account.productCategory
        ? accountTaxByAge(account, account.productCategory, member, household.baseYear)
        : null;
      if (built) accounts.push(built);
      else skippedAccounts += 1;
    }
  }
  return {
    asOf: TAX_BY_AGE_RULES.asOf,
    accounts,
    skippedAccounts,
    finalExemption: { year: FINAL_EXEMPTION_YEAR, percent: ratePercent(totalExemptionRate(FINAL_EXEMPTION_YEAR)) },
  };
}
