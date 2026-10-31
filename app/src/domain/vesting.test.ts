import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import type { StockHolding } from "../types";
import {
  addMonthsToIsoDate,
  batchStatusAtRetirement,
  DEFAULT_VESTING_TEMPLATE,
  employerShareBatches,
  forfeitedQuantityAt,
  generateVestingSchedule,
  isVestedBy,
  MAX_TEMPLATE_BATCHES,
  quantityAtRetirement,
  vestedQuantityAt,
} from "./vesting";

const ms = (iso: string) => Date.parse(iso);

const grantOf = (
  quantity: number,
  tranches: { vestDate?: string; quantity: number }[],
  keepsVestingAfterLeaving = false,
): StockHolding =>
  buildTestProfile({
    equity: [
      {
        quantity,
        priceUSD: 10,
        employerGrant: { vestingTranches: tranches, keepsVestingAfterLeaving },
      },
    ],
  }).equity.holdings[0];

describe("employerShareBatches", () => {
  it("makes one batch per tranche and a vested one for the shares no tranche covers", () => {
    const batches = employerShareBatches(
      grantOf(100, [
        { vestDate: "2026-09-15", quantity: 30 },
        { vestDate: "2026-12-15", quantity: 20 },
      ]),
    );
    expect(batches.map((batch) => [batch.vestDate, batch.quantity])).toEqual([
      ["2026-09-15", 30],
      ["2026-12-15", 20],
      [null, 50],
    ]);
    expect(batches[0].vestMs).toBe(ms("2026-09-15"));
    expect(batches[2].trancheId).toBeNull();
  });

  it("scales tranches that together exceed the quantity, and adds no remainder", () => {
    const batches = employerShareBatches(
      grantOf(100, [
        { vestDate: "2026-09-15", quantity: 150 },
        { vestDate: "2026-12-15", quantity: 50 },
      ]),
    );
    expect(batches.map((batch) => batch.quantity)).toEqual([75, 25]);
  });

  it("ignores tranches without a quantity and takes an unreadable date as undated", () => {
    const batches = employerShareBatches(
      grantOf(10, [{ vestDate: "not a date", quantity: 10 }, { vestDate: "2027-01-01", quantity: 0 }]),
    );
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({ vestDate: null, vestMs: null, quantity: 10 });
  });

  it("has no batches for a holding without a quantity", () => {
    expect(employerShareBatches(grantOf(0, []))).toEqual([]);
  });
});

describe("batch status", () => {
  const holding = grantOf(100, [{ vestDate: "2030-01-01", quantity: 40 }]);
  const [tranche, rest] = employerShareBatches(holding);

  it("counts a batch as vested on its vest date, and an undated one always", () => {
    expect(isVestedBy(tranche, ms("2030-01-01"))).toBe(true);
    expect(isVestedBy(tranche, ms("2029-12-31"))).toBe(false);
    expect(isVestedBy(rest, 0)).toBe(true);
  });

  it("forfeits an unvested batch at retirement, unless the grant keeps vesting after leaving", () => {
    expect(batchStatusAtRetirement(holding, tranche, ms("2031-01-01"))).toBe("vested");
    expect(batchStatusAtRetirement(holding, tranche, ms("2029-01-01"))).toBe("forfeited");
    const keeps = grantOf(100, [{ vestDate: "2030-01-01", quantity: 40 }], true);
    expect(batchStatusAtRetirement(keeps, tranche, ms("2029-01-01"))).toBe("keptByGrant");
  });
});

describe("quantities", () => {
  const tranches = [
    { vestDate: "2026-01-01", quantity: 10 },
    { vestDate: "2027-01-01", quantity: 20 },
    { vestDate: "2030-01-01", quantity: 30 },
  ];
  const lost = grantOf(100, tranches);
  const kept = grantOf(100, tranches, true);

  it("owns the vested batches and the untranched shares on a date", () => {
    // 40 in no batch, plus the 10 vested before mid-2026.
    expect(vestedQuantityAt(lost, ms("2026-06-15"))).toBe(50);
    expect(vestedQuantityAt(lost, ms("2027-06-15"))).toBe(70);
  });

  it("counts the shares vested by retirement, plus the unvested ones only when kept", () => {
    expect(quantityAtRetirement(lost, ms("2028-01-01"))).toBe(70);
    expect(quantityAtRetirement(kept, ms("2028-01-01"))).toBe(100);
    expect(forfeitedQuantityAt(lost, ms("2028-01-01"))).toBe(30);
    expect(forfeitedQuantityAt(kept, ms("2028-01-01"))).toBe(0);
  });

  it("treats a holding that is not an employer grant as owned in full", () => {
    const personal = buildTestProfile({ equity: [{ quantity: 25, priceUSD: 10 }] }).equity.holdings[0];
    expect(vestedQuantityAt(personal, 0)).toBe(25);
    expect(quantityAtRetirement(personal, 0)).toBe(25);
    expect(forfeitedQuantityAt(personal, 0)).toBe(0);
  });
});

describe("addMonthsToIsoDate", () => {
  it("adds calendar months", () => {
    expect(addMonthsToIsoDate("2026-03-15", 3)).toBe("2026-06-15");
    expect(addMonthsToIsoDate("2026-11-15", 3)).toBe("2027-02-15");
    expect(addMonthsToIsoDate("2026-03-15", 0)).toBe("2026-03-15");
  });

  it("cuts the day back to the last day of a shorter month", () => {
    expect(addMonthsToIsoDate("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsToIsoDate("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonthsToIsoDate("2026-08-31", 1)).toBe("2026-09-30");
  });

  it("returns null for something that is not a date", () => {
    expect(addMonthsToIsoDate("", 3)).toBeNull();
    expect(addMonthsToIsoDate("soon", 3)).toBeNull();
    expect(addMonthsToIsoDate("2026-13-01", 3)).toBeNull();
  });
});

describe("generateVestingSchedule", () => {
  it("makes 20 quarterly batches of 5% starting three months after the grant by default", () => {
    const schedule = generateVestingSchedule("2026-01-15", 1000, DEFAULT_VESTING_TEMPLATE);
    expect(schedule).toHaveLength(20);
    expect(schedule[0]).toEqual({ vestDate: "2026-04-15", quantity: 50 });
    expect(schedule[19]).toEqual({ vestDate: "2031-01-15", quantity: 50 });
    expect(schedule.reduce((sum, batch) => sum + batch.quantity, 0)).toBe(1000);
  });

  it("uses whole units and gives the last batch the remainder", () => {
    const schedule = generateVestingSchedule("2026-01-15", 103, { batches: 4, everyMonths: 6, firstVestMonths: 12 });
    expect(schedule.map((batch) => batch.quantity)).toEqual([25, 25, 25, 28]);
    expect(schedule.map((batch) => batch.vestDate)).toEqual([
      "2027-01-15",
      "2027-07-15",
      "2028-01-15",
      "2028-07-15",
    ]);
  });

  it("splits fractional units to four decimals and still adds up", () => {
    const schedule = generateVestingSchedule("2026-01-15", 10.5, { batches: 4, everyMonths: 3, firstVestMonths: 3 });
    expect(schedule.map((batch) => batch.quantity)).toEqual([2.625, 2.625, 2.625, 2.625]);
    const odd = generateVestingSchedule("2026-01-15", 10, { batches: 3, everyMonths: 3, firstVestMonths: 3 });
    expect(odd.reduce((sum, batch) => sum + batch.quantity, 0)).toBeCloseTo(10, 6);
    const third = generateVestingSchedule("2026-01-15", 1.0001, { batches: 3, everyMonths: 3, firstVestMonths: 3 });
    expect(third.reduce((sum, batch) => sum + batch.quantity, 0)).toBeCloseTo(1.0001, 6);
  });

  it("makes one unit per batch when there are fewer whole units than batches", () => {
    const schedule = generateVestingSchedule("2026-01-15", 3, DEFAULT_VESTING_TEMPLATE);
    expect(schedule.map((batch) => batch.quantity)).toEqual([1, 1, 1]);
  });

  it("can start vesting on the grant date", () => {
    const [first] = generateVestingSchedule("2026-01-15", 10, { batches: 2, everyMonths: 12, firstVestMonths: 0 });
    expect(first.vestDate).toBe("2026-01-15");
  });

  it("makes nothing from input that cannot form a schedule", () => {
    const template = DEFAULT_VESTING_TEMPLATE;
    expect(generateVestingSchedule("", 100, template)).toEqual([]);
    expect(generateVestingSchedule("2026-01-15", 0, template)).toEqual([]);
    expect(generateVestingSchedule("2026-01-15", Number.NaN, template)).toEqual([]);
    expect(generateVestingSchedule("2026-01-15", 100, { ...template, batches: 0 })).toEqual([]);
    expect(generateVestingSchedule("2026-01-15", 100, { ...template, batches: 2.5 })).toEqual([]);
    expect(generateVestingSchedule("2026-01-15", 100, { ...template, batches: MAX_TEMPLATE_BATCHES + 1 })).toEqual([]);
    expect(generateVestingSchedule("2026-01-15", 100, { ...template, everyMonths: 0 })).toEqual([]);
    expect(generateVestingSchedule("2026-01-15", 100, { ...template, firstVestMonths: -1 })).toEqual([]);
  });
});
