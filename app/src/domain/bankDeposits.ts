import type { BankDeposit } from "../types";

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/**
 * Current value in NIS of a single bank deposit: its principal compounded annually since the
 * start date, at its *real* (inflation-adjusted) rate of return — consistent with the rest of the
 * engine, which projects everything in today's money (see `realAnnualReturnRate`).
 *
 * A CPI-linked deposit's quoted rate is already on top of the index, so it is treated as real.
 * A fixed or variable-rate deposit quotes a nominal rate, so it is converted to real using the
 * plan's inflation assumption, the same way every other investment return is.
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
  const nominalRate = (deposit.annualInterestRatePercent ?? 0) / 100;
  const realRate = deposit.cpiLinked ? nominalRate : (1 + nominalRate) / (1 + inflationPct / 100) - 1;
  return amount * Math.pow(1 + realRate, years);
}

/** Sum of all bank deposits' current value, in NIS. */
export function aggregateBankDepositsBalance(
  deposits: readonly BankDeposit[],
  inflationPct: number,
  nowMs: number,
): number {
  return deposits.reduce((sum, deposit) => sum + bankDepositValueIls(deposit, inflationPct, nowMs), 0);
}
