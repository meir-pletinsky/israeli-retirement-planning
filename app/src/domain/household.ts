import type { Gender, ProfileData } from "../types";
import { EMPTY_SPOUSE } from "../types";
import { estimateBituachLeumiPension } from "./bituachLeumi";
import { BITUACH_LEUMI_RATES as RATES } from "./bituachLeumiRates";
import { MAX_PLANNING_AGE } from "./constants";
import {
  isHouseholdActive,
  ownAccounts,
  realAnnualReturnRate,
  resolveCurrentAge,
  resolveRetirementAge,
  resolveSpouseCurrentAge,
  resolveSpouseRetirementAge,
  spouseAccounts,
} from "./profileBasics";
import { buildSources, countUncategorizedAccounts, type RetirementSource } from "./sources";
import type { BituachLeumiEstimate, RetirementScenario, SpouseSupplement } from "./types";

/**
 * Couples and households. The single-person engine (`sources.ts`,
 * `bituachLeumi.ts`) is reused unchanged: each spouse becomes a "member view",
 * an ordinary single-person `ProfileData` holding only their own accounts,
 * salary and Bituach Leumi data. This module combines the members on one
 * shared clock, measured in years from now.
 *
 * Household rules (see docs/implementation-progress.md, Phase H):
 * - Each spouse stops contributing, unlocks capital and claims their state
 *   pension at their own ages.
 * - Household spending starts when the later spouse retires; until then the
 *   working spouse's pay is assumed to cover living costs. Savings and the
 *   earlier retiree's pot keep growing meanwhile, and payments that start
 *   before that point (an earlier retiree's pension) are not counted.
 * - Other assets and equity are household-level and belong to the primary user.
 * - The plan runs until the youngest spouse reaches `MAX_PLANNING_AGE`.
 */

export type MemberRole = "self" | "spouse";

/** When each spouse retires. `spouseAge` is null for a single person. */
export interface RetirementTiming {
  selfAge: number;
  spouseAge: number | null;
}

export interface HouseholdMember {
  role: MemberRole;
  /** Single-person view of the profile: this person's accounts, salary and Bituach Leumi data. */
  profile: ProfileData;
  currentAge: number;
  retirementAge: number;
  sources: RetirementSource[];
  /** Includes the spouse supplement this member receives, if any. */
  bituachLeumi: BituachLeumiEstimate;
}

export interface Household {
  /** The primary user first, then the spouse when the plan covers one. */
  members: HouseholdMember[];
  /** Real annual return. */
  rate: number;
  /** Years from now until the later member retires; household drawing starts then. */
  retirementYears: number;
  /** Years from now until the youngest member reaches `MAX_PLANNING_AGE`. */
  horizonYears: number;
  /**
   * The primary user's age when household drawing starts: their own
   * retirement age for a single person, the later spouse's retirement moment
   * for a couple.
   */
  drawdownStartAge: number;
  /** Counted accounts with a balance but no product type. */
  uncategorizedAccounts: number;
}

/** The primary user as a single-person profile: only their own accounts, no spouse. */
export function selfProfileView(profile: ProfileData): ProfileData {
  return {
    ...profile,
    spouse: EMPTY_SPOUSE,
    pensionSavings: { ...profile.pensionSavings, accounts: ownAccounts(profile) },
  };
}

/**
 * The spouse as a single-person profile: their own details and accounts. The
 * household's other assets and equity stay with the primary user, and
 * expenses and assumptions are shared.
 */
export function spouseProfileView(profile: ProfileData): ProfileData {
  const { spouse } = profile;
  return {
    ...profile,
    personal: {
      ...profile.personal,
      age: spouse.age,
      gender: spouse.gender,
      retirementAge: spouse.retirementAge,
      monthlyGrossSalary: spouse.monthlyGrossSalary,
    },
    spouse: EMPTY_SPOUSE,
    bituachLeumi: spouse.bituachLeumi,
    pensionSavings: {
      otherAssets: null,
      accounts: spouseAccounts(profile).map((account) => ({ ...account, owner: "self" })),
    },
    equity: { holdings: [] },
  };
}

/** Each spouse's retirement age for a scenario; both are shifted by the same offsets. */
export function resolveRetirementTiming(
  profile: ProfileData,
  scenario: RetirementScenario,
): RetirementTiming {
  return {
    selfAge: resolveRetirementAge(profile, scenario),
    spouseAge: isHouseholdActive(profile) ? resolveSpouseRetirementAge(profile, scenario) : null,
  };
}

/** The spouse's age when the primary user is `selfAge`. */
export function spouseAgeAt(profile: ProfileData, selfAge: number): number {
  return resolveSpouseCurrentAge(profile) + (selfAge - resolveCurrentAge(profile));
}

/**
 * Both spouses retiring at the same moment, the primary user at `selfAge`.
 * This is how a couple's "retire at N" and earliest-feasible-age questions
 * are posed.
 */
export function retirementTimingAtAge(profile: ProfileData, selfAge: number): RetirementTiming {
  return {
    selfAge,
    spouseAge: isHouseholdActive(profile) ? spouseAgeAt(profile, selfAge) : null,
  };
}

function incomeTestExemptAge(gender: Gender | null): number {
  return gender === "female"
    ? RATES.spouseIncomeTestExemptAgeWoman
    : RATES.spouseIncomeTestExemptAgeMan;
}

/**
 * The spouse supplement `recipient` gets for `spouse`, or null. It needs:
 * - the recipient's own pension to be paid (included and eligible);
 * - the spouse to have no pension of their own, so it ends when theirs starts
 *   and never applies when they are eligible for one from the start date;
 * - the spouse's income to pass the means test. The threshold is not
 *   published on the official page, so it is not modelled: the supplement is
 *   counted only once the spouse has stopped working or is past the age from
 *   which their income no longer matters.
 *
 * Whether the spouse's pension is *included* in the projection is ignored on
 * purpose: leaving it out of the projection must not hand the recipient a
 * supplement.
 */
function spouseSupplementFor(
  recipient: HouseholdMember,
  spouse: HouseholdMember,
): SpouseSupplement | null {
  const own = recipient.bituachLeumi;
  if (!own.included || !own.eligible || own.monthlyPension <= 0) return null;

  const yearsToOwnClaim = own.claimAge - recipient.currentAge;
  const yearsUntilSpouseIncomeIsOk =
    Math.min(spouse.retirementAge, incomeTestExemptAge(spouse.profile.personal.gender)) -
    spouse.currentAge;
  const start = Math.max(yearsToOwnClaim, yearsUntilSpouseIncomeIsOk, 0);
  const end = spouse.bituachLeumi.eligible
    ? spouse.bituachLeumi.claimAge - spouse.currentAge
    : Number.POSITIVE_INFINITY;
  if (start >= end) return null;

  return {
    monthly: RATES.spouseSupplementMonthly,
    startAge: recipient.currentAge + start,
    endAge: Number.isFinite(end) ? recipient.currentAge + end : null,
  };
}

/**
 * Combines the primary user (and the spouse, when `timing.spouseAge` is set
 * and the plan covers one) into a household. A single person yields a
 * household of one and behaves exactly like the single-person engine.
 */
export function buildHousehold(profile: ProfileData, timing: RetirementTiming): Household {
  const views: { role: MemberRole; view: ProfileData; retirementAge: number }[] = [
    { role: "self", view: selfProfileView(profile), retirementAge: timing.selfAge },
  ];
  if (timing.spouseAge !== null && isHouseholdActive(profile)) {
    views.push({
      role: "spouse",
      view: spouseProfileView(profile),
      retirementAge: timing.spouseAge,
    });
  }

  const members: HouseholdMember[] = views.map(({ role, view, retirementAge }) => ({
    role,
    profile: view,
    currentAge: resolveCurrentAge(view),
    retirementAge,
    sources: buildSources(view, retirementAge),
    bituachLeumi: estimateBituachLeumiPension(view, retirementAge),
  }));

  if (members.length === 2) {
    const [self, spouse] = members;
    const selfSupplement = spouseSupplementFor(self, spouse);
    const spouseSupplement = spouseSupplementFor(spouse, self);
    self.bituachLeumi = { ...self.bituachLeumi, spouseSupplement: selfSupplement };
    spouse.bituachLeumi = { ...spouse.bituachLeumi, spouseSupplement };
  }

  const retirementYears = Math.max(
    ...members.map((member) => Math.max(member.retirementAge - member.currentAge, 0)),
  );
  const primary = members[0];
  const primaryRetirementYears = Math.max(primary.retirementAge - primary.currentAge, 0);

  return {
    members,
    rate: realAnnualReturnRate(profile.assumptions),
    retirementYears,
    horizonYears: Math.max(
      ...members.map((member) => Math.max(MAX_PLANNING_AGE - member.currentAge, 0)),
    ),
    // Exact for the common case that the primary user retires last (or alone).
    drawdownStartAge:
      primaryRetirementYears === retirementYears
        ? Math.max(primary.retirementAge, primary.currentAge)
        : primary.currentAge + retirementYears,
    uncategorizedAccounts: members.reduce(
      (sum, member) => sum + countUncategorizedAccounts(member.profile),
      0,
    ),
  };
}

/** Years from now at which `member` reaches `age`. */
export function yearsUntilAge(member: HouseholdMember, age: number): number {
  return age - member.currentAge;
}

/** `member`'s age expressed as the primary user's age at the same moment. */
export function primaryAgeAtMemberAge(household: Household, member: HouseholdMember, age: number): number {
  const primary = household.members[0];
  return member.role === "self" ? age : primary.currentAge + yearsUntilAge(member, age);
}
