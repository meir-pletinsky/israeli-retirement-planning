import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import type { StockHolding } from "../types";
import { hasGainBasis, holdingLots, holdingTakesLots, incompleteLotCount, isUsableLot } from "./purchaseLots";

type Lot = { date?: string; quantity: number; priceUSD: number; usdToIlsRate?: number };

function holdingWith(
  lots: Lot[],
  options: { quantity: number; priceUSD: number; category?: "personalBrokeragePurchase" | "employerEsppDiscount" },
): StockHolding {
  const profile = buildTestProfile({
    equity: [
      {
        quantity: options.quantity,
        priceUSD: options.priceUSD,
        category: options.category ?? "personalBrokeragePurchase",
        purchaseLots: lots,
      },
    ],
  });
  return profile.equity.holdings[0];
}

describe("holdingLots (rule R)", () => {
  it("taxes the lower gain when the dollar was higher at purchase: bought $100 at 5.00, now $200 at 3.00", () => {
    const holding = holdingWith([{ quantity: 1, priceUSD: 100, usdToIlsRate: 5 }], { quantity: 1, priceUSD: 200 });
    const result = holdingLots(holding, 3);
    expect(result?.lots[0].valueIls).toBeCloseTo(600, 9);
    expect(result?.lots[0].nominalGainIls).toBeCloseTo(100, 9);
    expect(result?.lots[0].adjustedGainIls).toBeCloseTo(300, 9);
    expect(result?.gainIls).toBeCloseTo(100, 9);
    expect(result?.costBasisIls).toBeCloseTo(500, 9);
  });

  it("recognises only the smaller loss, and the engine takes no gain: bought $150 at 4.00, now $100 at 3.50", () => {
    const holding = holdingWith([{ quantity: 1, priceUSD: 150, usdToIlsRate: 4 }], { quantity: 1, priceUSD: 100 });
    const result = holdingLots(holding, 3.5);
    expect(result?.lots[0].nominalGainIls).toBeCloseTo(-250, 9);
    expect(result?.lots[0].adjustedGainIls).toBeCloseTo(-175, 9);
    expect(result?.lots[0].recognisedGainIls).toBeCloseTo(-175, 9);
    expect(result?.gainIls).toBe(0);
  });

  it("counts neither gain nor loss when the two measures disagree: the dollar gained but the shekel rate fell", () => {
    const holding = holdingWith([{ quantity: 1, priceUSD: 100, usdToIlsRate: 4 }], { quantity: 1, priceUSD: 110 });
    const result = holdingLots(holding, 3);
    // Shekel gain: 330 - 400 = -70. Dollar gain: $10 * 3 = 30.
    expect(result?.lots[0].nominalGainIls).toBeCloseTo(-70, 9);
    expect(result?.lots[0].adjustedGainIls).toBeCloseTo(30, 9);
    expect(result?.lots[0].recognisedGainIls).toBe(0);
  });

  it("equals the plain dollar gain at the sale rate when a lot has no rate", () => {
    const holding = holdingWith([{ quantity: 10, priceUSD: 40 }], { quantity: 10, priceUSD: 100 });
    const result = holdingLots(holding, 3.7);
    expect(result?.lots[0].purchaseRate).toBe(3.7);
    expect(result?.gainIls).toBeCloseTo(10 * 60 * 3.7, 9);
  });

  it("uses the sale rate as the basis rate when it is the higher of the two", () => {
    const holding = holdingWith([{ quantity: 1, priceUSD: 100, usdToIlsRate: 2.5 }], { quantity: 1, priceUSD: 200 });
    const result = holdingLots(holding, 3.7);
    expect(result?.costBasisIls).toBeCloseTo(370, 9);
    expect(result?.gainIls).toBeCloseTo(370, 9);
  });

  it("nets a lot's loss against another lot's gain, never going below zero", () => {
    const lots: Lot[] = [
      { quantity: 10, priceUSD: 50, usdToIlsRate: 3.7 },
      { quantity: 10, priceUSD: 150, usdToIlsRate: 3.7 },
    ];
    // Now $100: the first lot gains $500, the second loses $500; they cancel.
    const even = holdingLots(holdingWith(lots, { quantity: 20, priceUSD: 100 }), 3.7);
    expect(even?.gainIls).toBeCloseTo(0, 9);
    // Now $80: the first gains $300, the second loses $700, so no gain at all.
    const down = holdingLots(holdingWith(lots, { quantity: 20, priceUSD: 80 }), 3.7);
    expect(down?.gainIls).toBe(0);
    // Now $120: gains $700 and loses $300.
    const up = holdingLots(holdingWith(lots, { quantity: 20, priceUSD: 120 }), 3.7);
    expect(up?.gainIls).toBeCloseTo(400 * 3.7, 9);
  });

  it("gives the shares in no lot no gain", () => {
    const holding = holdingWith([{ quantity: 4, priceUSD: 50 }], { quantity: 10, priceUSD: 100 });
    const result = holdingLots(holding, 3.7);
    expect(result?.coveredQuantity).toBe(4);
    expect(result?.exceedsQuantity).toBe(false);
    expect(result?.gainIls).toBeCloseTo(4 * 50 * 3.7, 9);
  });

  it("scales the lots down when they add up to more than the holding", () => {
    const holding = holdingWith(
      [
        { quantity: 10, priceUSD: 50 },
        { quantity: 10, priceUSD: 50 },
      ],
      { quantity: 10, priceUSD: 100 },
    );
    const result = holdingLots(holding, 3.7);
    expect(result?.exceedsQuantity).toBe(true);
    expect(result?.listedQuantity).toBe(20);
    expect(result?.coveredQuantity).toBeCloseTo(10, 9);
    expect(result?.gainIls).toBeCloseTo(10 * 50 * 3.7, 9);
  });

  it("returns null without a usable lot, so the entered gain applies", () => {
    expect(holdingLots(holdingWith([], { quantity: 10, priceUSD: 100 }), 3.7)).toBeNull();
    const unfinished = holdingWith([{ quantity: 5, priceUSD: Number.NaN }], { quantity: 10, priceUSD: 100 });
    expect(holdingLots(unfinished, 3.7)).toBeNull();
  });

  describe("without lots, the purchase date and price entered with the holding", () => {
    const withEntry = (
      entry: { date?: string; priceUSD?: number; usdToIlsRate?: number },
      options: {
        quantity?: number;
        category?: "personalBrokeragePurchase" | "employerEsppDiscount";
        unrealizedCapitalGainUSD?: number;
        lots?: Lot[];
      } = {},
    ): StockHolding =>
      buildTestProfile({
        equity: [
          {
            quantity: options.quantity ?? 10,
            priceUSD: 100,
            category: options.category ?? "personalBrokeragePurchase",
            entry,
            unrealizedCapitalGainUSD: options.unrealizedCapitalGainUSD,
            purchaseLots: options.lots,
          },
        ],
      }).equity.holdings[0];

    it("count as a single lot of all the shares", () => {
      const result = holdingLots(withEntry({ date: "2019-06-15", priceUSD: 40, usdToIlsRate: 3.5 }), 3.7);
      expect(result?.fromEntry).toBe(true);
      expect(result?.lots).toHaveLength(1);
      expect(result?.lots[0]).toMatchObject({ purchaseDate: "2019-06-15", quantity: 10, priceUSD: 40, purchaseRate: 3.5 });
      // Nominal: 10 * 100 * 3.7 - 10 * 40 * 3.5 = 2,300; dollar: 10 * 60 * 3.7 = 2,220; the lower counts.
      expect(result?.gainIls).toBeCloseTo(2_220, 9);
    });

    it("use the sale rate when the purchase day's rate is missing or unusable", () => {
      expect(holdingLots(withEntry({ priceUSD: 40 }), 3.7)?.lots[0].purchaseRate).toBe(3.7);
      expect(holdingLots(withEntry({ priceUSD: 40, usdToIlsRate: 0 }), 3.7)?.lots[0].purchaseRate).toBe(3.7);
    });

    it("allow a price of zero, as for shares that were a gift", () => {
      expect(holdingLots(withEntry({ priceUSD: 0 }), 3.7)?.gainIls).toBeCloseTo(10 * 100 * 3.7, 9);
    });

    it("work for an ESPP holding", () => {
      const espp = withEntry({ priceUSD: 40 }, { category: "employerEsppDiscount" });
      expect(holdingLots(espp, 3.7)?.gainIls).toBeCloseTo(10 * 60 * 3.7, 9);
    });

    it("are not enough without a price or a quantity", () => {
      expect(holdingLots(withEntry({ date: "2019-06-15" }), 3.7)).toBeNull();
      expect(holdingLots(withEntry({ priceUSD: 40 }, { quantity: 0 }), 3.7)).toBeNull();
    });

    it("give way to a declared gain, even a declared zero", () => {
      expect(holdingLots(withEntry({ priceUSD: 40 }, { unrealizedCapitalGainUSD: 0 }), 3.7)).toBeNull();
    });

    it("give way to lots that were entered", () => {
      const result = holdingLots(withEntry({ priceUSD: 40 }, { lots: [{ quantity: 4, priceUSD: 90 }] }), 3.7);
      expect(result?.fromEntry).toBe(false);
      expect(result?.lots).toHaveLength(1);
      expect(result?.lots[0].quantity).toBe(4);
    });
  });

  describe("hasGainBasis", () => {
    const personal = (
      entry: { priceUSD?: number },
      extra: { unrealizedCapitalGainUSD?: number; lots?: Lot[]; category?: "employerGrantedStock" } = {},
    ) =>
      buildTestProfile({
        equity: [
          {
            quantity: 10,
            priceUSD: 100,
            category: extra.category ?? "personalBrokeragePurchase",
            entry,
            unrealizedCapitalGainUSD: extra.unrealizedCapitalGainUSD,
            purchaseLots: extra.lots,
          },
        ],
      }).equity.holdings[0];

    it("is true with an entered price, a declared gain or a usable lot", () => {
      expect(hasGainBasis(personal({ priceUSD: 40 }))).toBe(true);
      expect(hasGainBasis(personal({}, { unrealizedCapitalGainUSD: 0 }))).toBe(true);
      expect(hasGainBasis(personal({}, { lots: [{ quantity: 5, priceUSD: 10 }] }))).toBe(true);
    });

    it("is false for a private holding with none of them", () => {
      expect(hasGainBasis(personal({}))).toBe(false);
    });

    it("is true for a category whose tax does not come from lots", () => {
      expect(hasGainBasis(personal({}, { category: "employerGrantedStock" }))).toBe(true);
    });
  });

  it("applies to ESPP and private holdings only", () => {
    const lots: Lot[] = [{ quantity: 10, priceUSD: 50 }];
    const espp = holdingWith(lots, { quantity: 10, priceUSD: 100, category: "employerEsppDiscount" });
    expect(holdingLots(espp, 3.7)).not.toBeNull();
    const grant = buildTestProfile({
      equity: [{ quantity: 10, priceUSD: 100, category: "employerGrantedStock", purchaseLots: lots }],
    }).equity.holdings[0];
    expect(holdingTakesLots(grant)).toBe(false);
    expect(holdingLots(grant, 3.7)).toBeNull();
    const uncategorized = buildTestProfile({
      equity: [{ quantity: 10, priceUSD: 100, purchaseLots: lots }],
    }).equity.holdings[0];
    expect(holdingLots(uncategorized, 3.7)).toBeNull();
  });
});

describe("isUsableLot", () => {
  const base = { id: "x", purchaseDate: null, usdToIlsRate: null };

  it("needs shares and a price, and allows a price of zero", () => {
    expect(isUsableLot({ ...base, quantity: 5, priceUSD: 10 })).toBe(true);
    expect(isUsableLot({ ...base, quantity: 5, priceUSD: 0 })).toBe(true);
    expect(isUsableLot({ ...base, quantity: null, priceUSD: 10 })).toBe(false);
    expect(isUsableLot({ ...base, quantity: 0, priceUSD: 10 })).toBe(false);
    expect(isUsableLot({ ...base, quantity: 5, priceUSD: null })).toBe(false);
    expect(isUsableLot({ ...base, quantity: 5, priceUSD: -1 })).toBe(false);
  });

  it("counts the lots that are left out", () => {
    const holding = holdingWith(
      [
        { quantity: 5, priceUSD: 10 },
        { quantity: 0, priceUSD: 10 },
      ],
      { quantity: 10, priceUSD: 100 },
    );
    expect(incompleteLotCount(holding)).toBe(1);
  });
});
