import type { AccountOwner, ProfileData } from "../../types";
import { sameIdNumber } from "./israeliId";
import { matchCandidates } from "./matchAndApply";
import type { ReportMapResult } from "./types";

/**
 * A report's age is exact but the age typed into the profile may be a year stale, and the two
 * can straddle a birthday, so a gap of up to this many years is not treated as a different person.
 */
export const AGE_TOLERANCE_YEARS = 2;

/** Why a report does not look like it belongs to the person it is about to be saved under. */
export type OwnerConcern = "genderDiffers" | "ageDiffers" | "matchesOtherOwner";

export interface OwnerAssessment {
  owner: AccountOwner;
  concerns: OwnerConcern[];
  /** The ages behind an `ageDiffers` concern, for the message. */
  reportAge: number | null;
  profileAge: number | null;
  /** How many of the report's accounts, or its ID, point at accounts already saved under this owner. */
  knownAccounts: number;
}

function otherOwner(owner: AccountOwner): AccountOwner {
  return owner === "self" ? "spouse" : "self";
}

function knownAccounts(result: ReportMapResult, profile: ProfileData, owner: AccountOwner): number {
  const accounts = profile.pensionSavings.accounts;
  const matched = matchCandidates(result.candidates, accounts, owner).size;
  const idMatches = accounts.some(
    (account) =>
      account.owner === owner && result.holderIds.some((id) => sameIdNumber(account.policyNumber, id)),
  );
  return matched + (idMatches ? 1 : 0);
}

/** Compares a report with what the profile already holds about `owner`. */
export function assessOwner(result: ReportMapResult, profile: ProfileData, owner: AccountOwner): OwnerAssessment {
  const person = owner === "self" ? profile.personal : profile.spouse;
  const concerns: OwnerConcern[] = [];

  const reportGender = result.personal.gender?.value;
  if (reportGender && person.gender && reportGender !== person.gender) concerns.push("genderDiffers");

  const reportAge = result.personal.age?.value ?? null;
  const ageGap = reportAge !== null && person.age !== null ? Math.abs(reportAge - person.age) : 0;
  if (ageGap > AGE_TOLERANCE_YEARS) concerns.push("ageDiffers");

  const here = knownAccounts(result, profile, owner);
  const there = knownAccounts(result, profile, otherOwner(owner));
  if (here === 0 && there > 0) concerns.push("matchesOtherOwner");

  return {
    owner,
    concerns,
    reportAge: concerns.includes("ageDiffers") ? reportAge : null,
    profileAge: concerns.includes("ageDiffers") ? person.age : null,
    knownAccounts: here,
  };
}

/** Whether the profile already has anything that could belong to a partner. */
function hasPartner(profile: ProfileData): boolean {
  return (
    profile.personal.maritalStatus === "married" ||
    profile.spouse.age !== null ||
    profile.pensionSavings.accounts.some((account) => account.owner === "spouse")
  );
}

/**
 * Who the report most likely belongs to. The user is assumed unless the report clashes with their
 * details and fits the partner better; a partner is only considered when the profile has one.
 */
export function suggestOwner(result: ReportMapResult, profile: ProfileData): AccountOwner {
  if (!hasPartner(profile)) return "self";
  const self = assessOwner(result, profile, "self");
  const spouse = assessOwner(result, profile, "spouse");
  if (spouse.concerns.length !== self.concerns.length) {
    return spouse.concerns.length < self.concerns.length ? "spouse" : "self";
  }
  return spouse.knownAccounts > self.knownAccounts ? "spouse" : "self";
}
