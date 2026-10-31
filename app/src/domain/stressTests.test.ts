import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { estimateNetIncome } from "./netIncome";
import {
  buildStressTest,
  isEmployerStock,
  STRESS_COMBINED,
  STRESS_DOLLAR_DROPS_PCT,
  STRESS_EMPLOYER_STOCK_DROPS_PCT,
  type StressRow,
} from "./stressTests";

const zeroReal = { investmentReturnPct: 4, inflationPct: 4 };
const retired = { age: 60, retirementAge: 60, ...zeroReal, usdToIlsRate: { rate: 1 } };

type Profile = Parameters<typeof buildTestProfile>[0];
type Holding = NonNullable<Profile["equity"]>[number];

const stress = (overrides: Profile, scenario?: "early" | "standard" | "delayed") =>
  buildStressTest(buildTestProfile({ ...retired, ...overrides }), scenario);

/** Shares worth 100,000 at a dollar worth one shekel. */
const worth100k = (overrides: Partial<Holding> = {}): Holding => ({
  quantity: 1_000,
  priceUSD: 100,
  ...overrides,
});
const employerGrant = (overrides: Partial<Holding> = {}) => worth100k({ employerGrant: {}, ...overrides });

const rowOf = (rows: StressRow[], employerStockDropPct: number, dollarDropPct: number) =>
  rows.find((row) => row.employerStockDropPct === employerStockDropPct && row.dollarDropPct === dollarDropPct);

describe("buildStressTest", () => {
  it("has nothing to stress without dollar holdings", () => {
    expect(stress({ otherAssets: 500_000 })).toBeNull();
    expect(stress({})).toBeNull();
  });

  it("stresses only the dollar when the holdings are not the employer's", () => {
    const test = stress({ equity: [worth100k({ category: "personalBrokeragePurchase" })] });
    expect(test?.employerValue).toBe(0);
    expect(test?.dollarValue).toBe(100_000);
    expect(test?.rows.map((row) => [row.kind, row.employerStockDropPct, row.dollarDropPct])).toEqual([
      ["dollar", 0, 10],
      ["dollar", 0, 20],
    ]);
  });

  it("lists the employer, dollar and combined stresses when there are employer shares", () => {
    const test = stress({ equity: [employerGrant()] });
    expect(test?.rows.map((row) => [row.kind, row.employerStockDropPct, row.dollarDropPct])).toEqual([
      ["employerStock", STRESS_EMPLOYER_STOCK_DROPS_PCT[0], 0],
      ["employerStock", STRESS_EMPLOYER_STOCK_DROPS_PCT[1], 0],
      ["dollar", 0, STRESS_DOLLAR_DROPS_PCT[0]],
      ["dollar", 0, STRESS_DOLLAR_DROPS_PCT[1]],
      ["both", STRESS_COMBINED.employerStockPct, STRESS_COMBINED.dollarPct],
    ]);
  });

  it("reports the plan as it is, matching the net income estimate", () => {
    const profile = buildTestProfile({
      ...retired,
      retirementMonthlyExpenses: 250,
      equity: [employerGrant({ unrealizedCapitalGainUSD: 30_000 })],
    });
    const test = buildStressTest(profile);
    expect(test?.base.netWorthAtRetirement).toBe(100_000);
    expect(test?.base.netMonthlyIncome).toBe(estimateNetIncome(profile).netMonthlyIncome);
    expect(test?.base.monthlyGap).toBe(Math.round((test?.base.netMonthlyIncome ?? 0) - 250));
    expect(test?.desiredMonthly).toBe(250);
  });

  it("has no gap when no spending is entered", () => {
    const test = stress({ equity: [employerGrant()] });
    expect(test?.desiredMonthly).toBeNull();
    expect(test?.base.monthlyGap).toBeNull();
    expect(test?.rows.every((row) => row.monthlyGap === null)).toBe(true);
  });

  it("takes the employer shares' price down and nothing else", () => {
    const test = stress({ equity: [employerGrant()] });
    const rows = test?.rows ?? [];
    expect(rowOf(rows, 30, 0)).toMatchObject({
      netWorthAtRetirement: 70_000,
      netWorthChange: -30_000,
      netWorthChangePercent: -30,
    });
    expect(rowOf(rows, 50, 0)).toMatchObject({ netWorthAtRetirement: 50_000, netWorthChange: -50_000 });
  });

  it("takes the dollar down for every holding priced in dollars", () => {
    const test = stress({
      equity: [employerGrant({ quantity: 500 }), worth100k({ quantity: 500, category: "personalBrokeragePurchase" })],
    });
    const rows = test?.rows ?? [];
    expect(rowOf(rows, 0, 10)?.netWorthAtRetirement).toBe(90_000);
    expect(rowOf(rows, 0, 20)?.netWorthAtRetirement).toBe(80_000);
  });

  it("leaves shekel savings alone", () => {
    const test = stress({ otherAssets: 100_000, equity: [employerGrant()] });
    const rows = test?.rows ?? [];
    expect(test?.base.netWorthAtRetirement).toBe(200_000);
    expect(rowOf(rows, 50, 0)?.netWorthAtRetirement).toBe(150_000);
    expect(rowOf(rows, 0, 20)?.netWorthAtRetirement).toBe(180_000);
  });

  it("does not touch shares the person bought themselves when the employer's fall", () => {
    const test = stress({
      equity: [employerGrant({ quantity: 500 }), worth100k({ quantity: 500, category: "personalBrokeragePurchase" })],
    });
    expect(test?.employerValue).toBe(50_000);
    expect(rowOf(test?.rows ?? [], 50, 0)?.netWorthAtRetirement).toBe(75_000);
  });

  it("counts ESPP shares as employer shares", () => {
    const test = stress({ equity: [worth100k({ category: "employerEsppDiscount" })] });
    expect(test?.employerValue).toBe(100_000);
    expect(rowOf(test?.rows ?? [], 50, 0)?.netWorthAtRetirement).toBe(50_000);
  });

  it("combines both: 50% of the shares and 20% of the dollar leave 40%", () => {
    const test = stress({ equity: [employerGrant()] });
    expect(rowOf(test?.rows ?? [], 50, 20)).toMatchObject({
      kind: "both",
      netWorthAtRetirement: 40_000,
      netWorthChangePercent: -60,
    });
  });

  it("values the dollar at the built-in rate when the profile has none", () => {
    const profile = buildTestProfile({ age: 60, retirementAge: 60, ...zeroReal, equity: [employerGrant()] });
    const test = buildStressTest(profile);
    const rate = test!.dollarValue / 100_000;
    expect(rate).toBeGreaterThan(1);
    expect(rowOf(test!.rows, 0, 10)?.netWorthAtRetirement).toBe(Math.round(test!.base.netWorthAtRetirement * 0.9));
  });

  it("leaves out unvested shares that would be lost when the owner leaves", () => {
    const test = stress({
      equity: [
        employerGrant({
          employerGrant: { vestingTranches: [{ vestDate: "2030-01-01", quantity: 400 }] },
        }),
      ],
    });
    expect(test?.employerValue).toBe(60_000);
    expect(test?.base.netWorthAtRetirement).toBe(60_000);
  });

  it("counts unvested shares when the grant keeps vesting after leaving", () => {
    const test = stress({
      equity: [
        employerGrant({
          employerGrant: {
            keepsVestingAfterLeaving: true,
            vestingTranches: [{ vestDate: "2030-01-01", quantity: 400 }],
          },
        }),
      ],
    });
    expect(test?.employerValue).toBe(100_000);
  });

  it("has nothing to stress when every share would be lost", () => {
    const test = stress({
      equity: [
        employerGrant({
          employerGrant: { vestingTranches: [{ vestDate: "2030-01-01", quantity: 1_000 }] },
        }),
      ],
    });
    expect(test).toBeNull();
  });

  it("shrinks the taxed gain when the price falls, so the income falls less than the savings", () => {
    // A 30% gain taxed at 25% leaves 92.5% of what is drawn. Halving the price wipes out the gain.
    const test = stress({
      equity: [
        worth100k({
          quantity: 1_000,
          priceUSD: 1_000,
          category: "employerEsppDiscount",
          unrealizedCapitalGainUSD: 300_000,
        }),
      ],
    });
    const row = rowOf(test?.rows ?? [], 50, 0);
    expect(row?.netWorthChangePercent).toBeCloseTo(-50, 5);
    expect(row?.netMonthlyChangePercent).toBeGreaterThan(-50);
    expect(row?.netMonthlyChangePercent).toBeCloseTo(-100 * (1 - 0.5 / 0.925), 0);
  });

  it("lowers a gain stated in dollars with the dollar, so the tax follows", () => {
    // Without lots the gain is dollars times the rate, so a weaker dollar shrinks it.
    const test = stress({
      equity: [
        worth100k({
          quantity: 1_000,
          priceUSD: 1_000,
          category: "personalBrokeragePurchase",
          unrealizedCapitalGainUSD: 300_000,
        }),
      ],
    });
    const row = rowOf(test?.rows ?? [], 0, 20);
    expect(row?.netWorthChangePercent).toBeCloseTo(-20, 5);
    expect(row?.netMonthlyChangePercent).toBeCloseTo(-20, 0);
  });

  it("follows the scenario's retirement age", () => {
    const profile = buildTestProfile({
      age: 50,
      retirementAge: 60,
      ...zeroReal,
      usdToIlsRate: { rate: 1 },
      equity: [employerGrant()],
    });
    const early = buildStressTest(profile, "early");
    const delayed = buildStressTest(profile, "delayed");
    expect(early?.base.netMonthlyIncome).toBe(estimateNetIncome(profile, "early").netMonthlyIncome);
    expect(delayed?.base.netMonthlyIncome).toBe(estimateNetIncome(profile, "delayed").netMonthlyIncome);
    expect(early?.base.netMonthlyIncome).not.toBe(delayed?.base.netMonthlyIncome);
  });

  it("changes nothing in the profile", () => {
    const profile = buildTestProfile({
      ...retired,
      equity: [employerGrant({ unrealizedCapitalGainUSD: 30_000 })],
    });
    const before = structuredClone(profile);
    buildStressTest(profile);
    expect(profile).toEqual(before);
  });
});

describe("isEmployerStock", () => {
  it("is true for company grants and ESPP shares only", () => {
    const category = (value: NonNullable<Profile["equity"]>[number]["category"]) =>
      buildTestProfile({ equity: [{ quantity: 1, priceUSD: 1, category: value }] }).equity.holdings[0];
    expect(isEmployerStock(category("employerGrantedStock"))).toBe(true);
    expect(isEmployerStock(category("employerEsppDiscount"))).toBe(true);
    expect(isEmployerStock(category("personalBrokeragePurchase"))).toBe(false);
  });
});
