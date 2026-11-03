import type { BankDeposit } from "../types";

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/**
 * Current balance in NIS of a single bank deposit: its principal compounded annually since the
 * start date. This is the balance in *today's* shekels, so it is not deflated: the engine only
 * applies the real return from today onwards (see `realAnnualReturnRate`).
 *
 * A fixed or variable-rate deposit grows at its quoted (nominal) rate. A CPI-linked deposit also
 * has its principal indexed, so it grows at the quoted rate on top of the plan's inflation
 * assumption (an approximation of the actual index movement since the start date).
 */
export function bankDepositValueIls(
  deposit: BankDeposit,
  inflationPct: number,
  nowMs: number,
): number {
  const amount = deposit.amount ?? 0;
  if (amount <= 0) return 0;
  const startMs = deposit.startDate ? Date.parse(deposit.startDate) : NaN;
  if (!Number.isFinite(startMs) || nowMs <= startMs) return amount;

  const years = (nowMs - startMs) / MS_PER_YEAR;
  const interest = 1 + (deposit.annualInterestRatePercent ?? 0) / 100;
  const annualGrowth = deposit.cpiLinked ? interest * (1 + inflationPct / 100) : interest;
  return amount * Math.pow(annualGrowth, years);
}

/** Sum of all bank deposits' current value, in NIS. */
export function aggregateBankDepositsBalance(
  deposits: readonly BankDeposit[],
  inflationPct: number,
  nowMs: number,
): number {
  return deposits.reduce((sum, deposit) => sum + bankDepositValueIls(deposit, inflationPct, nowMs), 0);
}
