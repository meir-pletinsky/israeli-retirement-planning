import { describe, expect, it } from "vitest";

import {
  createEmptyStockHolding,
  createEmptyVestingTranche,
  type InvestmentCategory,
  type StockHolding,
} from "../../types";
import {
  applyHoldingChange,
  CATEGORY_ORDER,
  categoryChangePatch,
  createHoldingForCategory,
  entryDate,
  entryDatePatch,
  entryPricePatch,
  entryPriceUsd,
  hasAdvancedDetails,
} from "./holdingEntry";

function holdingOf(category: InvestmentCategory | null): StockHolding {
  return { ...createEmptyStockHolding(), investmentCategory: category };
}

function apply(holding: StockHolding, patch: Partial<StockHolding>): StockHolding {
  return { ...holding, ...patch };
}

describe("holdingEntry — date and price of the purchase or grant", () => {
  it("keeps an ESOP grant's date and price in the grant details", () => {
    let holding = holdingOf("employerGrantedStock");
    holding = apply(holding, entryDatePatch(holding, "2024-03-01"));
    holding = apply(holding, entryPricePatch(holding, 150));

    expect(holding.employerGrantDetails).toMatchObject({
      grantDate: "2024-03-01",
      costBasisAtGrantUSD: 150,
    });
    expect(entryDate(holding)).toBe("2024-03-01");
    expect(entryPriceUsd(holding)).toBe(150);
  });

  it("keeps an ESPP purchase's date and market price in the ESPP details", () => {
    let holding = holdingOf("employerEsppDiscount");
    holding = apply(holding, entryDatePatch(holding, "2025-06-15"));
    holding = apply(holding, entryPricePatch(holding, 90));

    expect(holding.esppDetails).toMatchObject({
      purchaseDate: "2025-06-15",
      fairMarketValueAtPurchaseUSD: 90,
      purchasePriceUSD: null,
    });
    expect(entryDate(holding)).toBe("2025-06-15");
    expect(entryPriceUsd(holding)).toBe(90);
  });

  it("keeps a private purchase's date and price as the cost basis", () => {
    let holding = holdingOf("personalBrokeragePurchase");
    holding = apply(holding, entryDatePatch(holding, "2023-01-10"));
    holding = apply(holding, entryPricePatch(holding, 40));

    expect(holding.personalPurchaseDetails).toMatchObject({
      purchaseDate: "2023-01-10",
      averageCostBasisUSD: 40,
    });
    expect(entryDate(holding)).toBe("2023-01-10");
    expect(entryPriceUsd(holding)).toBe(40);
  });

  it("keeps the entry of a holding without a category in every category's fields", () => {
    let holding = holdingOf(null);
    expect(entryDate(holding)).toBeNull();
    expect(entryPriceUsd(holding)).toBeNull();

    holding = apply(holding, entryDatePatch(holding, "2024-03-01"));
    holding = apply(holding, entryPricePatch(holding, 10));

    expect(entryDate(holding)).toBe("2024-03-01");
    expect(entryPriceUsd(holding)).toBe(10);
    expect(holding.employerGrantDetails).toMatchObject({
      grantDate: "2024-03-01",
      costBasisAtGrantUSD: 10,
    });
    expect(holding.esppDetails).toMatchObject({
      purchaseDate: "2024-03-01",
      fairMarketValueAtPurchaseUSD: 10,
    });
    expect(holding.personalPurchaseDetails).toMatchObject({
      purchaseDate: "2024-03-01",
      averageCostBasisUSD: 10,
    });

    holding = apply(holding, entryPricePatch(holding, null));
    expect(entryPriceUsd(holding)).toBeNull();
  });
});

describe("holdingEntry — categoryChangePatch", () => {
  it.each([
    ["employerGrantedStock", "employerGrantDetails", "grantDate", "costBasisAtGrantUSD"],
    ["employerEsppDiscount", "esppDetails", "purchaseDate", "fairMarketValueAtPurchaseUSD"],
    ["personalBrokeragePurchase", "personalPurchaseDetails", "purchaseDate", "averageCostBasisUSD"],
  ] as const)("moves an entry made before choosing a category into %s", (category, details, dateKey, priceKey) => {
    let holding = holdingOf(null);
    holding = apply(holding, entryDatePatch(holding, "2024-03-01"));
    holding = apply(holding, entryPricePatch(holding, 150));

    holding = apply(holding, categoryChangePatch(holding, category));

    expect(holding.investmentCategory).toBe(category);
    expect(entryDate(holding)).toBe("2024-03-01");
    expect(entryPriceUsd(holding)).toBe(150);
    expect(holding[details]).toMatchObject({ [dateKey]: "2024-03-01", [priceKey]: 150 });

    for (const other of CATEGORY_ORDER.filter((c) => c !== category)) {
      expect(entryDate({ ...holding, investmentCategory: other })).toBeNull();
      expect(entryPriceUsd({ ...holding, investmentCategory: other })).toBeNull();
    }
  });

  it("carries the entry from one category to another and leaves the old one empty", () => {
    let holding = holdingOf("employerEsppDiscount");
    holding = apply(holding, entryDatePatch(holding, "2025-06-15"));
    holding = apply(holding, entryPricePatch(holding, 90));

    holding = apply(holding, categoryChangePatch(holding, "personalBrokeragePurchase"));

    expect(holding.personalPurchaseDetails).toMatchObject({
      purchaseDate: "2025-06-15",
      averageCostBasisUSD: 90,
    });
    expect(holding.esppDetails).toMatchObject({
      purchaseDate: null,
      fairMarketValueAtPurchaseUSD: null,
    });
  });
});

describe("holdingEntry — createHoldingForCategory", () => {
  it("presets the category on a fresh, otherwise-empty holding", () => {
    const holding = createHoldingForCategory("personalBrokeragePurchase", []);
    expect(holding.investmentCategory).toBe("personalBrokeragePurchase");
    expect(holding.tickerSymbol).toBe("");
    expect(holding.companyName).toBe("");
  });

  it.each(["employerGrantedStock", "employerEsppDiscount"] as const)(
    "defaults the ticker symbol and company from the last %s holding, assuming the same employer",
    (category) => {
      const existing: StockHolding[] = [
        { ...holdingOf(category), tickerSymbol: "AAA", companyName: "Old Co" },
        { ...holdingOf(category), tickerSymbol: "BBB", companyName: "New Co" },
      ];

      const holding = createHoldingForCategory(category, existing);

      expect(holding.investmentCategory).toBe(category);
      expect(holding.tickerSymbol).toBe("BBB");
      expect(holding.companyName).toBe("New Co");
    },
  );

  it("does not carry a symbol into a private trade, which has no employer to assume", () => {
    const existing: StockHolding[] = [
      { ...holdingOf("personalBrokeragePurchase"), tickerSymbol: "AAA", companyName: "Old Co" },
    ];

    const holding = createHoldingForCategory("personalBrokeragePurchase", existing);

    expect(holding.tickerSymbol).toBe("");
    expect(holding.companyName).toBe("");
  });

  it("only looks at holdings of the same category for the default symbol", () => {
    const existing: StockHolding[] = [
      { ...holdingOf("employerGrantedStock"), tickerSymbol: "AAA", companyName: "Grant Co" },
    ];

    const holding = createHoldingForCategory("employerEsppDiscount", existing);

    expect(holding.tickerSymbol).toBe("");
    expect(holding.companyName).toBe("");
  });
});

describe("holdingEntry — hasAdvancedDetails", () => {
  it("is false for a fresh holding of every category", () => {
    for (const category of [
      "employerGrantedStock",
      "employerEsppDiscount",
      "personalBrokeragePurchase",
      null,
    ] as const) {
      expect(hasAdvancedDetails(holdingOf(category))).toBe(false);
    }
  });

  it("is true once a category's advanced field has a value", () => {
    const grant = holdingOf("employerGrantedStock");
    expect(
      hasAdvancedDetails({
        ...grant,
        employerGrantDetails: { ...grant.employerGrantDetails, taxTrack: "section3iNonTrustee" },
      }),
    ).toBe(true);

    const espp = holdingOf("employerEsppDiscount");
    expect(
      hasAdvancedDetails({ ...espp, esppDetails: { ...espp.esppDetails, discountPercentage: 15 } }),
    ).toBe(true);

    const personal = holdingOf("personalBrokeragePurchase");
    expect(
      hasAdvancedDetails({
        ...personal,
        personalPurchaseDetails: {
          ...personal.personalPurchaseDetails,
          unrealizedCapitalGainUSD: 500,
        },
      }),
    ).toBe(true);
  });
});

describe("holdingEntry — vesting batches follow the schedule", () => {
  const esop = () => ({
    ...holdingOf("employerGrantedStock"),
    quantity: 40,
    employerGrantDetails: { ...holdingOf("employerGrantedStock").employerGrantDetails, grantDate: "2024-03-01" },
  });
  const schedule = { batches: 4, everyMonths: 12, firstVestMonths: 12 };
  const withSchedule = (holding: StockHolding) =>
    applyHoldingChange(holding, {
      employerGrantDetails: { ...holding.employerGrantDetails, vestingSchedule: schedule },
    });

  it("generates the batches when the schedule is complete", () => {
    const { vestingTranches } = withSchedule(esop()).employerGrantDetails;
    expect(vestingTranches.map((t) => [t.vestDate, t.quantity])).toEqual([
      ["2025-03-01", 10],
      ["2026-03-01", 10],
      ["2027-03-01", 10],
      ["2028-03-01", 10],
    ]);
  });

  it("regenerates them when the quantity changes", () => {
    const next = applyHoldingChange(withSchedule(esop()), { quantity: 80 });
    expect(next.employerGrantDetails.vestingTranches.map((t) => t.quantity)).toEqual([20, 20, 20, 20]);
  });

  it("empties them when the schedule becomes incomplete", () => {
    const complete = withSchedule(esop());
    const next = applyHoldingChange(complete, {
      employerGrantDetails: {
        ...complete.employerGrantDetails,
        vestingSchedule: { ...schedule, everyMonths: null },
      },
    });
    expect(next.employerGrantDetails.vestingTranches).toEqual([]);
  });

  it("leaves batches without a schedule alone until the quantity or schedule is edited", () => {
    const base = esop();
    const custom = {
      ...base,
      employerGrantDetails: {
        ...base.employerGrantDetails,
        vestingTranches: [{ ...createEmptyVestingTranche(), vestDate: "2025-03-01", quantity: 5 }],
      },
    };
    expect(applyHoldingChange(custom, { tickerSymbol: "ABC" }).employerGrantDetails.vestingTranches).toHaveLength(1);
    expect(applyHoldingChange(custom, { quantity: 50 }).employerGrantDetails.vestingTranches).toHaveLength(1);
  });

  it("does not derive batches for other categories", () => {
    const espp = { ...holdingOf("employerEsppDiscount"), quantity: 40 };
    expect(withSchedule(espp).employerGrantDetails.vestingTranches).toEqual([]);
  });
});
