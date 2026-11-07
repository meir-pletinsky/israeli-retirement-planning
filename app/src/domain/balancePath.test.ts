import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { groupPathEvents, projectBalancePath, unvestedSharesInPath } from "./balancePath";
import { simulateDrawdown } from "./drawdown";
import { projectNetWorth } from "./netWorth";
import { SOURCE_KINDS } from "./sources";

const annuityParameters = {
  hasGuaranteedFactor: false,
  conversionFactor: 200,
  estimatedMonthlyAnnuity: null,
  annuityTaxType: null,
  guaranteedPaymentMonths: null,
};

const plan = {
  age: 50,
  retirementAge: 60,
  investmentReturnPct: 4,
  inflationPct: 4,
  pensionBalances: [400_000, 100_000],
  pensionAccountOverrides: [
    { productCategory: "pensionFund" as const, annuityParameters },
    { productCategory: "studyFund" as const },
  ],
  otherAssets: 50_000,
  retirementMonthlyExpenses: 3_000,
};

describe("projectBalancePath", () => {
  it("traces the same net worth as the projection, year by year", () => {
    const profile = buildTestProfile(plan);

    const { points } = projectBalancePath(profile);

    expect(points.map(({ age, netWorth }) => ({ age, netWorth }))).toEqual(projectNetWorth(profile));
  });

  it("splits each year by kind so the parts add up to the total", () => {
    const { points } = projectBalancePath(buildTestProfile(plan));

    for (const point of points) {
      const parts = SOURCE_KINDS.reduce((sum, kind) => sum + point.byKind[kind], 0);
      expect(parts).toBe(point.netWorth);
    }
    expect(points[0].byKind.pensionFund).toBeGreaterThan(0);
    expect(points[0].byKind.studyFund).toBeGreaterThan(0);
    expect(points[0].byKind.otherInvestments).toBeGreaterThan(0);
  });

  it("lists only the kinds that hold a balance at some age", () => {
    const { kinds } = projectBalancePath(buildTestProfile(plan));

    expect(kinds).toEqual(["pensionFund", "studyFund", "otherInvestments"]);
  });

  it("marks when drawing starts", () => {
    const { events } = projectBalancePath(buildTestProfile(plan));

    expect(events[0]).toEqual({ type: "retirement", age: 60, household: false });
  });

  it("marks the household when the plan covers a couple", () => {
    const { events } = projectBalancePath(
      buildTestProfile({ ...plan, maritalStatus: "married", spouse: { age: 48, retirementAge: 62 } }),
    );

    expect(events[0]).toMatchObject({ type: "retirement", household: true });
  });

  it("marks the year a pension fund becomes an annuity and drops its balance", () => {
    const profile = buildTestProfile(plan);
    const { points, events } = projectBalancePath(profile);

    const annuity = events.find((event) => event.type === "annuity" && event.kind === "pensionFund");
    expect(annuity).toBeDefined();
    if (annuity?.type !== "annuity") return;
    expect(annuity.monthly).toBeGreaterThan(0);
    expect(annuity.capital).toBeGreaterThan(0);

    const before = points.find((point) => point.age === annuity.age - 1)!;
    const at = points.find((point) => point.age === annuity.age)!;
    expect(before.byKind.pensionFund).toBeGreaterThan(0);
    expect(at.byKind.pensionFund).toBe(0);
    expect(at.netWorth).toBeLessThan(before.netWorth);
    // The capital that became the annuity is the balance that left the pension fund.
    expect(annuity.capital).toBeGreaterThanOrEqual(before.byKind.pensionFund);
    expect(before.netWorth - at.netWorth).toBeGreaterThanOrEqual(annuity.capital - 1);
  });

  it("reports each annuity once, not every year after it starts", () => {
    const { events } = projectBalancePath(buildTestProfile(plan));

    expect(events.filter((event) => event.type === "annuity" && event.kind === "pensionFund")).toHaveLength(1);
  });

  it("combines pension funds that become annuities in the same year", () => {
    const { events } = projectBalancePath(
      buildTestProfile({
        ...plan,
        pensionBalances: [200_000, 200_000],
        pensionAccountOverrides: [
          { productCategory: "pensionFund", annuityParameters },
          { productCategory: "pensionFund", annuityParameters },
        ],
      }),
    );

    const starts = events.filter((event) => event.type === "annuity" && event.kind === "pensionFund");
    expect(starts).toHaveLength(1);
  });

  it("has no annuity events when nothing converts", () => {
    const { events } = projectBalancePath(
      buildTestProfile({
        ...plan,
        pensionBalances: [100_000],
        pensionAccountOverrides: [{ productCategory: "studyFund" }],
      }),
    );

    expect(events.filter((event) => event.type === "annuity")).toEqual([]);
  });
});

describe("unvestedSharesInPath", () => {
  /** An ISO date `years` from now (the test clock is pinned to 2026-06-15). */
  const isoDateInYears = (years: number) =>
    new Date(Date.now() + years * 365.25 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  /** A 55-year-old retiring at 65 with 1,100 shares at $50: 100 vested, then 400, 300 and 300 vesting in 9.5, 10.5 and 11.5 years. */
  const profileWith = (keepsVestingAfterLeaving: boolean) =>
    buildTestProfile({
      age: 55,
      retirementAge: 65,
      pensionBalances: [400_000],
      equity: [
        {
          quantity: 1_100,
          priceUSD: 50,
          employerGrant: {
            keepsVestingAfterLeaving,
            vestingTranches: [
              { vestDate: isoDateInYears(9.5), quantity: 400 },
              { vestDate: isoDateInYears(10.5), quantity: 300 },
              { vestDate: isoDateInYears(11.5), quantity: 300 },
            ],
          },
        },
      ],
    });

  it("counts the batches that vest by retirement, at today's share price, with the age they vest", () => {
    // 400 shares * $50 * 3.7.
    expect(unvestedSharesInPath(profileWith(false))).toEqual({ value: 74_000, firstVestAge: 64, lastVestAge: 64 });
  });

  it("counts the later batches too when the grant keeps vesting after leaving", () => {
    // 1,000 shares * $50 * 3.7.
    expect(unvestedSharesInPath(profileWith(true))).toEqual({ value: 185_000, firstVestAge: 64, lastVestAge: 66 });
  });

  it("follows the scenario's retirement age", () => {
    expect(unvestedSharesInPath(profileWith(false), "early")).toBeNull();
    expect(unvestedSharesInPath(profileWith(false), "delayed")?.value).toBe(185_000);
  });

  it("is null when every share has vested or there are no employer shares", () => {
    const vested = buildTestProfile({
      age: 55,
      retirementAge: 65,
      equity: [
        {
          quantity: 100,
          priceUSD: 50,
          employerGrant: { vestingTranches: [{ vestDate: isoDateInYears(-1), quantity: 100 }] },
        },
      ],
    });
    expect(unvestedSharesInPath(vested)).toBeNull();
    expect(unvestedSharesInPath(buildTestProfile({ age: 55, retirementAge: 65 }))).toBeNull();
  });

  it("is part of the balance path, which counts those shares from its first year", () => {
    const path = projectBalancePath(profileWith(false));
    const without = projectBalancePath({
      ...profileWith(false),
      equity: { ...profileWith(false).equity, holdings: [] },
    });

    expect(path.unvestedShares).toEqual(unvestedSharesInPath(profileWith(false)));
    expect(without.unvestedShares).toBeNull();
    expect(path.points[0].netWorth - without.points[0].netWorth).toBeGreaterThanOrEqual(74_000 - 1);
  });
});

describe("groupPathEvents", () => {
  it("groups events of the same age, earliest first, keeping their order", () => {
    const retirement = { type: "retirement" as const, age: 60, household: false };
    const early = { type: "annuity" as const, age: 58, kind: "managersInsurance" as const, capital: 1, monthly: 1 };
    const pension = { type: "annuity" as const, age: 60, kind: "pensionFund" as const, capital: 2, monthly: 2 };

    expect(groupPathEvents([retirement, pension, early])).toEqual([
      { age: 58, events: [early] },
      { age: 60, events: [retirement, pension] },
    ]);
  });

  it("has no groups when there are no events", () => {
    expect(groupPathEvents([])).toEqual([]);
  });
});

describe("simulateDrawdown balances and conversions", () => {
  it("sums the balances by kind to the net worth", () => {
    const rows = simulateDrawdown(buildTestProfile(plan), 60, 3_000);

    for (const row of rows) {
      const parts = SOURCE_KINDS.reduce((sum, kind) => sum + row.balances[kind], 0);
      expect(parts).toBeCloseTo(row.netWorth, 6);
    }
  });

  it("records the capital and monthly amount in the year an annuity starts only", () => {
    const rows = simulateDrawdown(buildTestProfile(plan), 60, 3_000);

    const starts = rows.flatMap((row) => row.conversions);
    expect(starts).toHaveLength(1);
    expect(starts[0].kind).toBe("pensionFund");
    expect(rows.filter((row) => row.conversions.length > 0)).toHaveLength(1);
  });
});
