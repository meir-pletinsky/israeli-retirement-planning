import type { AccountOwner, ImportedReport, ProfileData } from "../../types";
import { sameIdNumber } from "./israeliId";
import { matchCandidates } from "./matchAndApply";
import { sharesKey } from "./reportPeople";
import type { ReportMapResult } from "./types";

/**
 * A report's age is exact but the age typed into the profile may be a year stale, and the two
 * can straddle a birthday, so a gap of up to this many years is not treated as a different person.
 */
export const AGE_TOLERANCE_YEARS = 2;

/** Why a report does not look like it belongs to the person it is about to be saved under. */
export type OwnerConcern =
  | "multiplePeople"
  | "samePersonOtherOwner"
  | "differentPerson"
  | "genderDiffers"
  | "ageDiffers"
  | "matchesOtherOwner";

export interface OwnerAssessment {
  owner: AccountOwner;
  concerns: OwnerConcern[];
  /** The ages behind an `ageDiffers` concern, for the message. */
  reportAge: number | null;
  profileAge: number | null;
  /** How many of the report's accounts, or its ID, point at accounts already saved under this owner. */
  knownAccounts: number;
  /** The newest earlier import that is about the same person as this report, under either owner. */
  recognisedReport: ImportedReport | null;
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

/** Earlier real imports (never the sample) whose fingerprints can be compared, newest first. */
function comparableReports(profile: ProfileData): ImportedReport[] {
  return profile.pensionSavings.reports
    .filter((report) => !report.sample && report.personKeys.length > 0)
    .sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}

/** The earlier imports about the same person as this report. Empty when the report has no fingerprints. */
export function recognisedReports(result: ReportMapResult, profile: ProfileData): ImportedReport[] {
  const keys = result.people.flatMap((person) => person.keys);
  if (keys.length === 0) return [];
  return comparableReports(profile).filter((report) => sharesKey(report.personKeys, keys));
}

/** Compares a report with what the profile already holds about `owner`. */
export function assessOwner(result: ReportMapResult, profile: ProfileData, owner: AccountOwner): OwnerAssessment {
  const person = owner === "self" ? profile.personal : profile.spouse;
  const concerns: OwnerConcern[] = [];
  if (result.people.length > 1) concerns.push("multiplePeople");

  const recognised = recognisedReports(result, profile);
  const recognisedHere = recognised.find((report) => report.owner === owner) ?? null;
  const recognisedThere = recognised.find((report) => report.owner === otherOwner(owner)) ?? null;
  const reportKeys = result.people.flatMap((entry) => entry.keys);

  if (!recognisedHere && recognisedThere) concerns.push("samePersonOtherOwner");
  if (
    !recognisedHere &&
    !recognisedThere &&
    reportKeys.length > 0 &&
    comparableReports(profile).some((report) => report.owner === owner)
  ) {
    concerns.push("differentPerson");
  }

  // A report recognised under this owner is the same person by fingerprint, so a stale profile age or
  // a mistyped gender says nothing about whose it is.
  if (!recognisedHere) {
    const reportGender = result.personal.gender?.value;
    if (reportGender && person.gender && reportGender !== person.gender) concerns.push("genderDiffers");
  }

  const reportAge = result.personal.age?.value ?? null;
  const ageGap = reportAge !== null && person.age !== null ? Math.abs(reportAge - person.age) : 0;
  if (!recognisedHere && ageGap > AGE_TOLERANCE_YEARS) concerns.push("ageDiffers");

  const here = knownAccounts(result, profile, owner);
  const there = knownAccounts(result, profile, otherOwner(owner));
  if (!recognisedHere && !recognisedThere && here === 0 && there > 0) concerns.push("matchesOtherOwner");

  return {
    owner,
    concerns,
    reportAge: concerns.includes("ageDiffers") ? reportAge : null,
    profileAge: concerns.includes("ageDiffers") ? person.age : null,
    knownAccounts: here,
    recognisedReport: recognisedHere ?? recognisedThere,
  };
}

/** Whether the profile already has anything that could belong to a partner. */
function hasPartner(profile: ProfileData): boolean {
  return (
    profile.personal.maritalStatus === "married" ||
    profile.spouse.age !== null ||
    profile.pensionSavings.accounts.some((account) => account.owner === "spouse") ||
    profile.pensionSavings.reports.some((report) => report.owner === "spouse" && !report.sample)
  );
}

/**
 * Who the report most likely belongs to. An earlier import of the same person decides; otherwise
 * the user is assumed unless the report clashes with their details and fits the partner better. A
 * partner is only considered when the profile has one.
 */
export function suggestOwner(result: ReportMapResult, profile: ProfileData): AccountOwner {
  const recognised = recognisedReports(result, profile)[0];
  if (recognised) return recognised.owner;
  if (!hasPartner(profile)) return "self";
  const self = assessOwner(result, profile, "self");
  const spouse = assessOwner(result, profile, "spouse");
  if (spouse.concerns.length !== self.concerns.length) {
    return spouse.concerns.length < self.concerns.length ? "spouse" : "self";
  }
  return spouse.knownAccounts > self.knownAccounts ? "spouse" : "self";
}
