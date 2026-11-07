import type { ProfileData } from "../types";
import { aggregateBankDepositsBalance } from "./bankDeposits";
import {
  accountsInPlan,
  aggregateCurrentNetWorth,
  holdingValueIls,
  isHouseholdActive,
  resolveCurrentAge,
  resolveSpouseCurrentAge,
  usdToIlsRate,
} from "./profileBasics";
import { accountUnlockAge, sourceKindForCategory } from "./sources";
import { engineNowMs } from "./trace";
import { isEmployerGrant, vestedQuantityAt } from "./vesting";

/** What Net Worth Today is made of, in the order the Dashboard lists it. */
export type PortfolioRowKey =
  | "pensionFund"
  | "providentFund"
  | "managersInsurance"
  | "studyFund"
  | "bankDeposits"
  | "privateShares"
  | "employerShares"
  | "cashAndOther";

export const PORTFOLIO_ROW_KEYS: readonly PortfolioRowKey[] = [
  "pensionFund",
  "providentFund",
  "managersInsurance",
  "studyFund",
  "bankDeposits",
  "privateShares",
  "employerShares",
  "cashAndOther",
];

/** Shares are priced in dollars, so their shekel value moves with the exchange rate. */
const DOLLAR_PRICED_ROWS: ReadonlySet<PortfolioRowKey> = new Set(["privateShares", "employerShares"]);

export interface PortfolioRow {
  key: PortfolioRowKey;
  /** Whole shekels. */
  amount: number;
  /** Priced in US dollars and converted at the exchange rate. */
  dollarPriced: boolean;
}

/** Whether the money can be spent today or is locked until an age. */
export type PortfolioAccessKey = "usableNow" | "locked";

export interface PortfolioGroupRow {
  key: PortfolioRowKey;
  /** Whole shekels. */
  amount: number;
  dollarPriced: boolean;
  /** Locked rows: the primary user's age when the first of their locked accounts opens, to the nearest year. */
  opensAtAge: number | null;
}

/** The part of Net Worth Today that can be spent now, or is locked, with its rows. */
export interface PortfolioGroup {
  key: PortfolioAccessKey;
  /** Whole shekels; the groups add up to `total`. */
  amount: number;
  rows: PortfolioGroupRow[];
}

export interface PortfolioFxBasis {
  rate: number;
  /** `boi`: the Bank of Israel rate of `date`; `typed`: the user's own; `fallback`: the built-in rough rate. */
  source: "boi" | "typed" | "fallback";
  date: string | null;
}

export interface PortfolioBreakdown {
  /** The non-empty rows. They add up to `total` exactly. */
  rows: PortfolioRow[];
  /** The same rows split by whether the money is usable now; empty groups are left out. */
  groups: PortfolioGroup[];
  /** Total of the rows that are priced in dollars. */
  dollarPriced: number;
  /** `aggregateCurrentNetWorth`, in whole shekels. */
  total: number;
  /** Value of employer shares that have not vested yet, which Net Worth Today leaves out. */
  unvestedEmployerShares: number;
  /** How share values were converted to shekels; null when there are no stock holdings. */
  fx: PortfolioFxBasis | null;
  /** The pension accounts counted include the spouse's. */
  includesSpouse: boolean;
}

/**
 * Splits Net Worth Today into the kinds of assets it counts. It uses the same pieces as
 * `aggregateCurrentNetWorth`, so the rows add up to that figure: whole-shekel rounding is
 * settled on the largest row rather than leaving the list a shekel off its total. The same
 * rows are also split by access (`groups`): an account is usable now when the age it opens at
 * has passed for its owner, and locked until then.
 */
export function breakdownPortfolio(profile: ProfileData): PortfolioBreakdown {
  const nowMs = engineNowMs();
  const rate = usdToIlsRate(profile);
  const amounts: Record<PortfolioRowKey, number> = {
    pensionFund: 0,
    providentFund: 0,
    managersInsurance: 0,
    studyFund: 0,
    bankDeposits: aggregateBankDepositsBalance(
      profile.bankDeposits,
      profile.assumptions.inflationPct,
      nowMs,
    ),
    privateShares: 0,
    employerShares: 0,
    cashAndOther: profile.pensionSavings.otherAssets ?? 0,
  };
  const lockedAmounts: Record<PortfolioRowKey, number> = {
    pensionFund: 0,
    providentFund: 0,
    managersInsurance: 0,
    studyFund: 0,
    bankDeposits: 0,
    privateShares: 0,
    employerShares: 0,
    cashAndOther: 0,
  };
  const opensAt: Partial<Record<PortfolioRowKey, number>> = {};
  const primaryAge = resolveCurrentAge(profile);

  for (const account of accountsInPlan(profile)) {
    const kind = sourceKindForCategory(account.productCategory);
    const key: PortfolioRowKey = kind === "otherInvestments" ? "cashAndOther" : kind;
    const balance = account.totalAccumulatedBalance ?? 0;
    // An account is never an "other investments" source; the fallback only keeps the rows summing to the total.
    amounts[key] += balance;

    const ownerAge = account.owner === "spouse" ? resolveSpouseCurrentAge(profile) : primaryAge;
    const unlockAge = accountUnlockAge(account, ownerAge);
    if (balance > 0 && unlockAge > ownerAge) {
      lockedAmounts[key] += balance;
      const opensAtYourAge = Math.round(primaryAge + (unlockAge - ownerAge));
      opensAt[key] = Math.min(opensAt[key] ?? opensAtYourAge, opensAtYourAge);
    }
  }

  let unvestedEmployerShares = 0;
  for (const holding of profile.equity.holdings) {
    const vested = vestedQuantityAt(holding, nowMs);
    if (isEmployerGrant(holding)) {
      amounts.employerShares += holdingValueIls(holding, rate, vested);
      unvestedEmployerShares += holdingValueIls(
        holding,
        rate,
        Math.max((holding.quantity ?? 0) - vested, 0),
      );
    } else {
      amounts.privateShares += holdingValueIls(holding, rate, vested);
    }
  }

  const total = Math.round(aggregateCurrentNetWorth(profile));
  const rows: PortfolioRow[] = PORTFOLIO_ROW_KEYS.map((key) => ({
    key,
    amount: Math.round(amounts[key]),
    dollarPriced: DOLLAR_PRICED_ROWS.has(key),
  })).filter((row) => row.amount > 0);
  const rounding = total - rows.reduce((sum, row) => sum + row.amount, 0);
  if (rounding !== 0 && rows.length > 0) {
    const largest = rows.reduce((best, row) => (row.amount > best.amount ? row : best));
    largest.amount += rounding;
  }

  const lockedRows: PortfolioGroupRow[] = [];
  const usableRows: PortfolioGroupRow[] = [];
  for (const row of rows) {
    const locked = Math.min(Math.round(lockedAmounts[row.key]), row.amount);
    if (locked > 0) {
      lockedRows.push({ ...row, amount: locked, opensAtAge: opensAt[row.key] ?? null });
    }
    if (row.amount - locked > 0) {
      usableRows.push({ ...row, amount: row.amount - locked, opensAtAge: null });
    }
  }
  const groups: PortfolioGroup[] = (
    [
      { key: "usableNow", rows: usableRows },
      { key: "locked", rows: lockedRows },
    ] as const
  )
    .filter((group) => group.rows.length > 0)
    .map((group) => ({
      key: group.key,
      amount: group.rows.reduce((sum, row) => sum + row.amount, 0),
      rows: group.rows,
    }));

  const { usdToIlsRate: storedRate, usdToIlsRateDate } = profile.equity;
  const fx: PortfolioFxBasis | null =
    profile.equity.holdings.length === 0
      ? null
      : {
          rate,
          source: storedRate === null ? "fallback" : usdToIlsRateDate ? "boi" : "typed",
          date: storedRate !== null ? usdToIlsRateDate : null,
        };

  return {
    rows,
    groups,
    dollarPriced: rows.filter((row) => row.dollarPriced).reduce((sum, row) => sum + row.amount, 0),
    total,
    unvestedEmployerShares: Math.round(unvestedEmployerShares),
    fx,
    includesSpouse: isHouseholdActive(profile) && accountsInPlan(profile).some((a) => a.owner === "spouse"),
  };
}
