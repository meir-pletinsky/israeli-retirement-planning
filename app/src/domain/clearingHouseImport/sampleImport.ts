import type { PensionAccount, ProfileData } from "../../types";

function sampleReportIds(profile: ProfileData): Set<string> {
  return new Set(profile.pensionSavings.reports.filter((report) => report.sample).map((report) => report.id));
}

function isSampleAccount(account: PensionAccount, sampleIds: ReadonlySet<string>): boolean {
  return account.reportId !== null && sampleIds.has(account.reportId);
}

/** How many accounts in the plan came from the bundled sample report, and so are made-up. */
export function countSampleAccounts(profile: ProfileData): number {
  const sampleIds = sampleReportIds(profile);
  if (sampleIds.size === 0) return 0;
  return profile.pensionSavings.accounts.filter((account) => isSampleAccount(account, sampleIds)).length;
}

/**
 * The profile changes that take the sample import back out: its accounts and its report records.
 * Accounts typed in or imported from a real report are left as they are. Profile details the
 * sample filled into an empty plan (age, salary) were written as ordinary values and stay.
 */
export function removeSampleImport(profile: ProfileData): Partial<ProfileData> {
  const sampleIds = sampleReportIds(profile);
  return {
    pensionSavings: {
      ...profile.pensionSavings,
      accounts: profile.pensionSavings.accounts.filter((account) => !isSampleAccount(account, sampleIds)),
      reports: profile.pensionSavings.reports.filter((report) => !report.sample),
    },
  };
}
