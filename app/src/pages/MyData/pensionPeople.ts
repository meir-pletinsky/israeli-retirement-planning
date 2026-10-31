import type { PensionAccount, PensionSavingsData } from "../../types";
import type { Person } from "./activePerson";

/** The balances of the given accounts, a missing balance counting as 0. */
export function sumBalances(accounts: readonly PensionAccount[]): number {
  return accounts.reduce((sum, account) => sum + (account.totalAccumulatedBalance ?? 0), 0);
}

/** The accounts that belong to one person. */
export function accountsOf(accounts: readonly PensionAccount[], person: Person): PensionAccount[] {
  return accounts.filter((account) => account.owner === person);
}

/**
 * The savings without one account. When it was the last account imported from its report, the
 * record of that report goes too, so no trace of the person is kept once their data is gone.
 */
export function withoutAccount(savings: PensionSavingsData, id: string): PensionSavingsData {
  const removed = savings.accounts.find((account) => account.id === id);
  const accounts = savings.accounts.filter((account) => account.id !== id);
  const reportId = removed?.reportId ?? null;
  const stillUsed = reportId !== null && accounts.some((account) => account.reportId === reportId);
  return {
    ...savings,
    accounts,
    reports: reportId !== null && !stillUsed ? savings.reports.filter((report) => report.id !== reportId) : savings.reports,
  };
}
