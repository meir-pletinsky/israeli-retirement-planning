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

/**
 * The yearly return of a deposit above inflation, which is what the plan grows it at from today
 * onwards; null when the profile records no rate for it. A CPI-linked deposit pays its quoted
 * rate on top of the index, so the quoted rate is the real return. Any other deposit pays its
 * quoted rate in nominal terms, so inflation is taken off it. The deposit is assumed to roll
 * over at the same rate after maturity.
 */
export function bankDepositRealReturn(deposit: BankDeposit, inflationPct: number): number | null {
  const ratePct = deposit.annualInterestRatePercent;
  if (ratePct === null || ratePct === undefined || !Number.isFinite(ratePct)) return null;
  return deposit.cpiLinked ? ratePct / 100 : (1 + ratePct / 100) / (1 + inflationPct / 100) - 1;
}

/**
 * The real return the plan grows all the bank deposits at: each deposit's own real return,
 * weighted by its current value. A deposit with no recorded rate earns `fallbackRate`, the
 * plan's real return, so entering no rates changes nothing.
 */
export function aggregateBankDepositsRealReturn(
  deposits: readonly BankDeposit[],
  inflationPct: number,
  fallbackRate: number,
  nowMs: number,
): number {
  let total = 0;
  let weighted = 0;
  let anyOwnRate = false;
  for (const deposit of deposits) {
    const value = bankDepositValueIls(deposit, inflationPct, nowMs);
    if (value <= 0) continue;
    const own = bankDepositRealReturn(deposit, inflationPct);
    anyOwnRate ||= own !== null;
    total += value;
    weighted += value * (own ?? fallbackRate);
  }
  return anyOwnRate && total > 0 ? weighted / total : fallbackRate;
}

/** Sum of all bank deposits' current value, in NIS. */
export function aggregateBankDepositsBalance(
  deposits: readonly BankDeposit[],
  inflationPct: number,
  nowMs: number,
): number {
  return deposits.reduce((sum, deposit) => sum + bankDepositValueIls(deposit, inflationPct, nowMs), 0);
}
