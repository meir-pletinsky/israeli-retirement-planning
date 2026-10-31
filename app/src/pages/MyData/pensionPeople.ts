import type { PensionAccount } from "../../types";
import type { Person } from "./activePerson";

/** The balances of the given accounts, a missing balance counting as 0. */
export function sumBalances(accounts: readonly PensionAccount[]): number {
  return accounts.reduce((sum, account) => sum + (account.totalAccumulatedBalance ?? 0), 0);
}

/** The accounts that belong to one person. */
export function accountsOf(accounts: readonly PensionAccount[], person: Person): PensionAccount[] {
  return accounts.filter((account) => account.owner === person);
}
