import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { buildLeavingEarlyCosts } from "./leavingEarly";

const zeroReal = { investmentReturnPct: 4, inflationPct: 4 };

/** An ISO date `years` from now (the test clock is pinned to 2026-06-15). */
const isoDateInYears = (years: number) =>
  new Date(Date.now() + years * 365.25 * 24 * 3600 * 1000).toISOString().slice(0, 10);

/** A 55-year-old retiring at 65 with 1,100 shares: 100 already theirs, 400 vesting in 9 years and 300 each in 10.5 and 11.5. */
const profileWith = (options: { keepsVestingAfterLeaving?: boolean; priceUSD?: number } = {}) =>
  buildTestProfile({
    age: 55,
    gender: "male",
    retirementAge: 65,
    pensionBalances: [400_000],
    equity: [
      {
        quantity: 1_100,
        priceUSD: options.priceUSD ?? 50,
        employerGrant: {
          keepsVestingAfterLeaving: options.keepsVestingAfterLeaving,
          vestingTranches: [
            { vestDate: isoDateInYears(9), quantity: 400 },
            { vestDate: isoDateInYears(10.5), quantity: 300 },
            { vestDate: isoDateInYears(11.5), quantity: 300 },
          ],
        },
      },
    ],
    ...zeroReal,
  });

describe("buildLeavingEarlyCosts", () => {
  it("counts the shares that are still unvested on the retirement date as lost", () => {
    const costs = buildLeavingEarlyCosts(profileWith());
    expect(costs).toHaveLength(1);
    expect(costs[0]?.owner).toBe("self");
    expect(costs[0]?.retirementDate).toBe(isoDateInYears(10));
    // 300 + 300 shares * $50 * 3.7.
    expect(costs[0]?.lostShares).toBe(600);
    expect(costs[0]?.lostValue).toBe(111_000);
  });

  it("describes the next batch to vest and what staying until then adds each month", () => {
    const next = buildLeavingEarlyCosts(profileWith())[0]?.next;
    expect(next?.vestDate).toBe(isoDateInYears(10.5));
    expect(next?.monthsLater).toBe(6);
    expect(next?.shares).toBe(300);
    expect(next?.value).toBe(55_500);
    expect(next?.monthlyNetGain).toBeGreaterThan(0);
    // Keeping 55,500 for the rest of the plan cannot add more than it is worth per month.
    expect(next?.monthlyNetGain).toBeLessThan(55_500 / 12);
  });

  it("loses more shares the earlier the owner retires, and none when every batch has vested", () => {
    expect(buildLeavingEarlyCosts(profileWith(), "early")[0]?.lostShares).toBe(1_000);
    expect(buildLeavingEarlyCosts(profileWith(), "delayed")).toEqual([]);
  });

  it("is empty when the grant keeps vesting after leaving", () => {
    expect(buildLeavingEarlyCosts(profileWith({ keepsVestingAfterLeaving: true }))).toEqual([]);
  });

  it("is empty without employer shares, or when the lost shares have no price", () => {
    expect(buildLeavingEarlyCosts(buildTestProfile({ age: 55, retirementAge: 65 }))).toEqual([]);
    expect(buildLeavingEarlyCosts(profileWith({ priceUSD: 0 }))).toEqual([]);
  });

  it("leaves out shares that vest on the retirement date or earlier", () => {
    const profile = buildTestProfile({
      age: 55,
      retirementAge: 65,
      equity: [
        {
          quantity: 100,
          priceUSD: 10,
          employerGrant: { vestingTranches: [{ vestDate: isoDateInYears(9), quantity: 100 }] },
        },
      ],
    });
    expect(buildLeavingEarlyCosts(profile)).toEqual([]);
  });

  describe("with a partner's grants", () => {
    const couple = (spouseGrantOwner: "self" | "spouse", married = true) =>
      buildTestProfile({
        age: 55,
        gender: "male",
        retirementAge: 65,
        pensionBalances: [400_000],
        maritalStatus: married ? "married" : undefined,
        spouse: married ? { age: 50, gender: "female", retirementAge: 55 } : undefined,
        equity: [
          {
            quantity: 500,
            priceUSD: 50,
            employerGrant: { vestingTranches: [{ vestDate: isoDateInYears(12), quantity: 400 }] },
          },
          {
            quantity: 500,
            priceUSD: 20,
            employerGrant: {
              owner: spouseGrantOwner,
              vestingTranches: [
                { vestDate: isoDateInYears(3), quantity: 200 },
                { vestDate: isoDateInYears(8), quantity: 200 },
              ],
            },
          },
        ],
        ...zeroReal,
      });

    it("loses each grant when its own owner retires, the primary user first", () => {
      const costs = buildLeavingEarlyCosts(couple("spouse"));
      expect(costs.map((cost) => cost.owner)).toEqual(["self", "spouse"]);
      expect(costs[0]?.retirementDate).toBe(isoDateInYears(10));
      expect(costs[0]?.lostShares).toBe(400);
      expect(costs[0]?.lostValue).toBe(400 * 50 * 3.7);
      // Only the batch vesting in 8 years is after the partner's retirement in 5.
      expect(costs[1]?.retirementDate).toBe(isoDateInYears(5));
      expect(costs[1]?.lostShares).toBe(200);
      expect(costs[1]?.lostValue).toBe(200 * 20 * 3.7);
      expect(costs[1]?.next?.vestDate).toBe(isoDateInYears(8));
    });

    it("loses the same grant at the primary user's retirement when it is theirs", () => {
      const costs = buildLeavingEarlyCosts(couple("self"));
      expect(costs).toHaveLength(1);
      // Nothing of the batch vesting in 8 years is lost by the primary user, who retires in 10.
      expect(costs[0]?.lostShares).toBe(400);
    });

    it("counts a grant marked as the partner's as the primary user's when there is no partner", () => {
      const costs = buildLeavingEarlyCosts(couple("spouse", false));
      expect(costs).toEqual(buildLeavingEarlyCosts(couple("self", false)));
      expect(costs.map((cost) => cost.owner)).toEqual(["self"]);
    });
  });
});
