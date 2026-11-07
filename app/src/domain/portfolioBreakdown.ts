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

/** A single company's shares are flagged on the Dashboard when they are more than this share of the total, in percent. */
export const CONCENTRATION_THRESHOLD_PCT = 10;

/** Shares in one company that make up more than the threshold of Net Worth Today. */
export interface PortfolioConcentration {
  /** The ticker, else the company name; null when the holdings have neither. */
  name: string | null;
  /** Whole shekels, the vested shares only, as in Net Worth Today. */
  amount: number;
  /** Of `PortfolioBreakdown.total`. */
  percent: number;
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
  /**
   * Companies whose shares are over the threshold, largest first, whatever the category of the
   * holding. A company held only through employer grants is left out: the employer-share
   * note already covers it.
   */
  concentrations: PortfolioConcentration[];
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
  const companies = new Map<string, { name: string | null; amount: number; onlyEmployerGrants: boolean }>();
  for (const holding of profile.equity.holdings) {
    const vested = vestedQuantityAt(holding, nowMs);
    const value = holdingValueIls(holding, rate, vested);
    if (isEmployerGrant(holding)) {
      amounts.employerShares += value;
      unvestedEmployerShares += holdingValueIls(
        holding,
        rate,
        Math.max((holding.quantity ?? 0) - vested, 0),
      );
    } else {
      amounts.privateShares += value;
    }

    const ticker = holding.tickerSymbol.trim().toUpperCase();
    const company = holding.companyName.trim();
    const name = ticker || company || null;
    const key = name ? name.toLowerCase() : `holding:${holding.id}`;
    const entry = companies.get(key) ?? { name, amount: 0, onlyEmployerGrants: true };
    entry.amount += value;
    entry.onlyEmployerGrants &&= isEmployerGrant(holding);
    companies.set(key, entry);
  }

  const total = Math.round(aggregateCurrentNetWorth(profile));
  const concentrations: PortfolioConcentration[] = [...companies.values()]
    .filter(
      (company) =>
        !company.onlyEmployerGrants &&
        total > 0 &&
        (company.amount / total) * 100 > CONCENTRATION_THRESHOLD_PCT,
    )
    .map((company) => ({
      name: company.name,
      amount: Math.round(company.amount),
      percent: (company.amount / total) * 100,
    }))
    .sort((a, b) => b.amount - a.amount);
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
    concentrations,
    unvestedEmployerShares: Math.round(unvestedEmployerShares),
    fx,
    includesSpouse: isHouseholdActive(profile) && accountsInPlan(profile).some((a) => a.owner === "spouse"),
  };
}
