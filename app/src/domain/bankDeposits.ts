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
 *
 * A fixed-term deposit stops accruing at its maturity date unless it is marked as auto-renewing;
 * variable-rate deposits have no term and always keep accruing.
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

  const maturityMs = deposit.maturityDate ? Date.parse(deposit.maturityDate) : NaN;
  const stopsAtMaturity =
    deposit.rateType !== "variable" && !deposit.autoRenew && Number.isFinite(maturityMs);
  const accrualEndMs = stopsAtMaturity ? Math.min(nowMs, maturityMs) : nowMs;
  if (accrualEndMs <= startMs) return amount;

  const years = (accrualEndMs - startMs) / MS_PER_YEAR;
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
