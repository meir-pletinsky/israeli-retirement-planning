import type { StockHolding } from "../types";

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** Epoch milliseconds of the retirement moment, `years` from the engine's "now". */
export function momentAfterYears(nowMs: number, years: number): number {
  return nowMs + Math.max(years, 0) * MS_PER_YEAR;
}

/** Years from `nowMs` to `epochMs`; negative when it is in the past. */
export function yearsBetween(nowMs: number, epochMs: number): number {
  return (epochMs - nowMs) / MS_PER_YEAR;
}

/** One batch of an employer grant's shares: a vesting tranche, or the part of the holding no tranche covers. */
export interface ShareBatch {
  /** Id of the vesting tranche; null for the shares no tranche covers. */
  trancheId: string | null;
  quantity: number;
  /** ISO date it vests; null = already vested (undated batch, or shares no tranche covers). */
  vestDate: string | null;
  /** Epoch milliseconds of `vestDate`; null when there is none or it cannot be read. */
  vestMs: number | null;
  /** The batch's own price at grant; null = the holding's price at grant. */
  grantPriceUSD: number | null;
}

/**
 * What happens to a batch when its owner retires at a given moment:
 * - `vested`: already vested, so the shares are held;
 * - `keptByGrant`: still unvested, but the grant keeps vesting after leaving, so they are counted;
 * - `forfeited`: still unvested and lost.
 */
export type BatchStatus = "vested" | "keptByGrant" | "forfeited";

/**
 * Splits an employer holding into batches: one per vesting tranche that has
 * a quantity, plus the shares no tranche covers, which are already vested.
 * Tranches that together exceed the holding's quantity are scaled down to fit.
 */
export function employerShareBatches(holding: StockHolding): ShareBatch[] {
  const total = Math.max(holding.quantity ?? 0, 0);
  const tranches = holding.employerGrantDetails.vestingTranches.filter(
    (tranche) => (tranche.quantity ?? 0) > 0,
  );
  const trancheTotal = tranches.reduce((sum, tranche) => sum + (tranche.quantity ?? 0), 0);
  const scale = trancheTotal > total ? total / trancheTotal : 1;

  const batches = tranches.map((tranche): ShareBatch => {
    const time = tranche.vestDate ? Date.parse(tranche.vestDate) : Number.NaN;
    return {
      trancheId: tranche.id,
      quantity: (tranche.quantity ?? 0) * scale,
      vestDate: Number.isNaN(time) ? null : tranche.vestDate,
      vestMs: Number.isNaN(time) ? null : time,
      grantPriceUSD: tranche.grantPriceUSD,
    };
  });
  const rest = trancheTotal >= total ? 0 : total - trancheTotal;
  if (rest > 0) {
    batches.push({ trancheId: null, quantity: rest, vestDate: null, vestMs: null, grantPriceUSD: null });
  }
  return batches;
}

/** Whether `batch` has vested by `atMs`. An undated batch counts as vested. */
export function isVestedBy(batch: ShareBatch, atMs: number): boolean {
  return batch.vestMs === null || batch.vestMs <= atMs;
}

/** The status of `batch` for an owner who retires at `retirementMs`. */
export function batchStatusAtRetirement(
  holding: StockHolding,
  batch: ShareBatch,
  retirementMs: number,
): BatchStatus {
  if (isVestedBy(batch, retirementMs)) return "vested";
  return holding.employerGrantDetails.keepsVestingAfterLeaving ? "keptByGrant" : "forfeited";
}

/** Whether `holding` is an employer grant, the only kind that vests. */
export function isEmployerGrant(holding: StockHolding): boolean {
  return holding.investmentCategory === "employerGrantedStock";
}

/**
 * Shares of `holding` that are the owner's on `atMs`: for an employer grant
 * the batches vested by then; any other holding in full.
 */
export function vestedQuantityAt(holding: StockHolding, atMs: number): number {
  if (!isEmployerGrant(holding)) return holding.quantity ?? 0;
  return employerShareBatches(holding)
    .filter((batch) => isVestedBy(batch, atMs))
    .reduce((sum, batch) => sum + batch.quantity, 0);
}

/**
 * Shares of `holding` that count towards the savings of an owner who retires
 * at `retirementMs`: the batches vested by then, plus the unvested ones when
 * the grant keeps vesting after leaving. Any other holding counts in full.
 */
export function quantityAtRetirement(holding: StockHolding, retirementMs: number): number {
  if (!isEmployerGrant(holding)) return holding.quantity ?? 0;
  return employerShareBatches(holding)
    .filter((batch) => batchStatusAtRetirement(holding, batch, retirementMs) !== "forfeited")
    .reduce((sum, batch) => sum + batch.quantity, 0);
}

/** Shares of `holding` that are lost for an owner who retires at `retirementMs`. */
export function forfeitedQuantityAt(holding: StockHolding, retirementMs: number): number {
  if (!isEmployerGrant(holding)) return 0;
  return employerShareBatches(holding)
    .filter((batch) => batchStatusAtRetirement(holding, batch, retirementMs) === "forfeited")
    .reduce((sum, batch) => sum + batch.quantity, 0);
}

/** ISO date (YYYY-MM-DD) `months` after `iso`, with the day cut back to the month's last day (31 Jan + 1 month = 28 Feb); null when `iso` is not a date. */
export function addMonthsToIsoDate(iso: string, months: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

/** An even vesting schedule: `batches` equal batches, the first `firstVestMonths` after the grant, then one every `everyMonths`. */
export interface VestingTemplate {
  batches: number;
  everyMonths: number;
  firstVestMonths: number;
}

/** 5% a quarter for 20 quarters, the first batch three months after the grant. */
export const DEFAULT_VESTING_TEMPLATE: VestingTemplate = {
  batches: 20,
  everyMonths: 3,
  firstVestMonths: 3,
};

export const MAX_TEMPLATE_BATCHES = 120;

const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

/**
 * The vesting batches of an award of `totalUnits` units granted on
 * `grantDate`. Whole awards are split into whole units, the last batch taking
 * the remainder, so the quantities always add up to `totalUnits`. Returns an
 * empty list when the grant date, units or template cannot make a schedule.
 */
export function generateVestingSchedule(
  grantDate: string,
  totalUnits: number,
  template: VestingTemplate,
): { vestDate: string; quantity: number }[] {
  const { everyMonths, firstVestMonths } = template;
  if (
    !Number.isFinite(totalUnits) ||
    totalUnits <= 0 ||
    !Number.isInteger(template.batches) ||
    template.batches < 1 ||
    template.batches > MAX_TEMPLATE_BATCHES ||
    !Number.isInteger(everyMonths) ||
    everyMonths < 1 ||
    !Number.isInteger(firstVestMonths) ||
    firstVestMonths < 0
  ) {
    return [];
  }
  // Fewer units than batches: one unit per batch.
  const count = Number.isInteger(totalUnits) ? Math.min(template.batches, totalUnits) : template.batches;
  const unit = Number.isInteger(totalUnits) ? Math.floor(totalUnits / count) : round4(totalUnits / count);
  const schedule: { vestDate: string; quantity: number }[] = [];
  for (let index = 0; index < count; index += 1) {
    const vestDate = addMonthsToIsoDate(grantDate, firstVestMonths + index * everyMonths);
    if (vestDate === null) return [];
    schedule.push({
      vestDate,
      quantity: index === count - 1 ? round4(totalUnits - unit * (count - 1)) : unit,
    });
  }
  return schedule;
}
