import type { ProfileData } from "../types";
import { aggregateBankDepositsBalance } from "./bankDeposits";
import {
  accountsInPlan,
  aggregateCurrentNetWorth,
  holdingValueIls,
  isHouseholdActive,
  usdToIlsRate,
} from "./profileBasics";
import { sourceKindForCategory } from "./sources";
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

export interface PortfolioRow {
  key: PortfolioRowKey;
  /** Whole shekels. */
  amount: number;
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
 * settled on the largest row rather than leaving the list a shekel off its total.
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

  for (const account of accountsInPlan(profile)) {
    const kind = sourceKindForCategory(account.productCategory);
    // An account is never an "other investments" source; the fallback only keeps the rows summing to the total.
    amounts[kind === "otherInvestments" ? "cashAndOther" : kind] += account.totalAccumulatedBalance ?? 0;
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
  const rows = PORTFOLIO_ROW_KEYS.map((key) => ({ key, amount: Math.round(amounts[key]) })).filter(
    (row) => row.amount > 0,
  );
  const rounding = total - rows.reduce((sum, row) => sum + row.amount, 0);
  if (rounding !== 0 && rows.length > 0) {
    const largest = rows.reduce((best, row) => (row.amount > best.amount ? row : best));
    largest.amount += rounding;
  }

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
    total,
    unvestedEmployerShares: Math.round(unvestedEmployerShares),
    fx,
    includesSpouse: isHouseholdActive(profile) && accountsInPlan(profile).some((a) => a.owner === "spouse"),
  };
}
