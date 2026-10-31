import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { EMPTY_BITUACH_LEUMI, EMPTY_SPOUSE, normalizeProfile } from "./index";

describe("normalizeProfile", () => {
  it("adds an empty spouse to a profile saved before couples were supported", () => {
    const { spouse: _spouse, ...legacy } = buildTestProfile({ age: 40 });
    const result = normalizeProfile(legacy);
    expect(result.spouse).toEqual(EMPTY_SPOUSE);
  });

  it("merges a partial spouse onto the defaults, including their Bituach Leumi data", () => {
    const result = normalizeProfile({
      spouse: { age: 52, bituachLeumi: { insuredYearsToDate: 12 } },
    } as Parameters<typeof normalizeProfile>[0]);
    expect(result.spouse.age).toBe(52);
    expect(result.spouse.retirementAge).toBeNull();
    expect(result.spouse.bituachLeumi).toEqual({ ...EMPTY_BITUACH_LEUMI, insuredYearsToDate: 12 });
  });

  it("defaults a saved spouse's credit points to null so the gender default applies", () => {
    const { creditPoints: _creditPoints, ...withoutPoints } = EMPTY_SPOUSE;
    const result = normalizeProfile({
      spouse: { ...withoutPoints, age: 52 },
    } as unknown as Parameters<typeof normalizeProfile>[0]);
    expect(result.spouse.creditPoints).toBeNull();
    expect(EMPTY_SPOUSE.creditPoints).toBeNull();
  });

  it("keeps a spouse's saved credit points", () => {
    const result = normalizeProfile({
      spouse: { age: 52, creditPoints: 2.5 },
    } as Parameters<typeof normalizeProfile>[0]);
    expect(result.spouse.creditPoints).toBe(2.5);
  });

  it("owns accounts without an owner by the primary user and keeps spouse ownership", () => {
    const profile = buildTestProfile({ pensionBalances: [1, 2, 3] });
    const accounts = profile.pensionSavings.accounts.map((account, index) => {
      const { owner: _owner, ...rest } = account;
      return index === 1 ? { ...rest, owner: "spouse" as const } : rest;
    });
    const result = normalizeProfile({
      ...profile,
      pensionSavings: { ...profile.pensionSavings, accounts },
    } as Parameters<typeof normalizeProfile>[0]);
    expect(result.pensionSavings.accounts.map((account) => account.owner)).toEqual([
      "self",
      "spouse",
      "self",
    ]);
  });

  it("adds empty reference IDs to accounts saved before they existed and keeps saved ones", () => {
    const profile = buildTestProfile({
      pensionBalances: [1, 2],
      pensionAccountOverrides: [{}, { policyNumber: "P-1", fundId: "F-2" }],
    });
    const accounts = profile.pensionSavings.accounts.map((account, index) => {
      const { policyNumber: _policyNumber, fundId: _fundId, ...rest } = account;
      return index === 1 ? account : rest;
    });
    const result = normalizeProfile({
      ...profile,
      pensionSavings: { ...profile.pensionSavings, accounts },
    } as Parameters<typeof normalizeProfile>[0]);
    expect(result.pensionSavings.accounts.map(({ policyNumber, fundId }) => [policyNumber, fundId])).toEqual([
      ["", ""],
      ["P-1", "F-2"],
    ]);
  });

  it("adds an empty tranche list to employer holdings saved before vesting tranches and keeps saved ones", () => {
    const profile = buildTestProfile({
      equity: [
        { quantity: 10, priceUSD: 5, employerGrant: {} },
        {
          quantity: 20,
          priceUSD: 5,
          employerGrant: { vestingTranches: [{ vestDate: "2024-01-01", quantity: 7, grantPriceUSD: 3 }] },
        },
      ],
    });
    const holdings = profile.equity.holdings.map((holding, index) => {
      const { vestingTranches: _vestingTranches, ...details } = holding.employerGrantDetails;
      return index === 1 ? holding : { ...holding, employerGrantDetails: details };
    });
    const result = normalizeProfile({
      ...profile,
      equity: { holdings },
    } as unknown as Parameters<typeof normalizeProfile>[0]);
    expect(result.equity.holdings[0].employerGrantDetails.vestingTranches).toEqual([]);
    expect(result.equity.holdings[1].employerGrantDetails.vestingTranches).toEqual([
      { id: "test-tranche-1-0", vestDate: "2024-01-01", quantity: 7, grantPriceUSD: 3 },
    ]);
  });

  it("adds no dollar rates to a profile saved before they existed", () => {
    const profile = buildTestProfile({
      equity: [
        { category: "employerGrantedStock", quantity: 1, priceUSD: 5 },
        { category: "employerEsppDiscount", quantity: 1, priceUSD: 5 },
        { category: "personalBrokeragePurchase", quantity: 1, priceUSD: 5 },
      ],
    });
    const holdings = profile.equity.holdings.map((holding) => {
      const { usdToIlsRateAtGrant: _grant, ...grant } = holding.employerGrantDetails;
      const { usdToIlsRateAtPurchase: _espp, ...espp } = holding.esppDetails;
      const { usdToIlsRateAtPurchase: _personal, ...personal } = holding.personalPurchaseDetails;
      return { ...holding, employerGrantDetails: grant, esppDetails: espp, personalPurchaseDetails: personal };
    });
    const result = normalizeProfile({ ...profile, equity: { holdings } } as unknown as Parameters<
      typeof normalizeProfile
    >[0]);

    expect(result.equity.usdToIlsRate).toBeNull();
    expect(result.equity.usdToIlsRateDate).toBeNull();
    for (const holding of result.equity.holdings) {
      expect(holding.employerGrantDetails.usdToIlsRateAtGrant).toBeNull();
      expect(holding.esppDetails.usdToIlsRateAtPurchase).toBeNull();
      expect(holding.personalPurchaseDetails.usdToIlsRateAtPurchase).toBeNull();
    }
  });

  it("keeps saved dollar rates, and drops one that is not a positive number", () => {
    const profile = buildTestProfile({
      usdToIlsRate: { rate: 3.118, date: "2026-10-30" },
      equity: [
        { category: "employerGrantedStock", quantity: 1, priceUSD: 5, entry: { usdToIlsRate: 3.65 } },
        { category: "employerEsppDiscount", quantity: 1, priceUSD: 5, entry: { usdToIlsRate: 3.7 } },
        { category: "personalBrokeragePurchase", quantity: 1, priceUSD: 5, entry: { usdToIlsRate: 3.8 } },
      ],
    });

    const kept = normalizeProfile(profile);
    expect(kept.equity.usdToIlsRate).toBe(3.118);
    expect(kept.equity.usdToIlsRateDate).toBe("2026-10-30");
    expect(kept.equity.holdings.map((holding) => holding.employerGrantDetails.usdToIlsRateAtGrant)).toEqual([
      3.65,
      null,
      null,
    ]);
    expect(kept.equity.holdings[1].esppDetails.usdToIlsRateAtPurchase).toBe(3.7);
    expect(kept.equity.holdings[2].personalPurchaseDetails.usdToIlsRateAtPurchase).toBe(3.8);

    for (const bad of [0, -3.6, Number.NaN, Number.POSITIVE_INFINITY, "3.6", null]) {
      const result = normalizeProfile({
        ...profile,
        equity: {
          ...profile.equity,
          usdToIlsRate: bad,
          holdings: profile.equity.holdings.map((holding) => ({
            ...holding,
            employerGrantDetails: { ...holding.employerGrantDetails, usdToIlsRateAtGrant: bad },
          })),
        },
      } as unknown as Parameters<typeof normalizeProfile>[0]);
      expect(result.equity.usdToIlsRate).toBeNull();
      expect(result.equity.usdToIlsRateDate).toBeNull();
      expect(result.equity.holdings[0].employerGrantDetails.usdToIlsRateAtGrant).toBeNull();
    }
  });

  it("drops the day of a rate that is not a date text, and keeps a rate typed without a day", () => {
    const profile = buildTestProfile({ usdToIlsRate: { rate: 3.3 } });
    const typed = normalizeProfile(profile);
    expect(typed.equity.usdToIlsRate).toBe(3.3);
    expect(typed.equity.usdToIlsRateDate).toBeNull();

    const result = normalizeProfile({
      ...profile,
      equity: { ...profile.equity, usdToIlsRateDate: 20261030 },
    } as unknown as Parameters<typeof normalizeProfile>[0]);
    expect(result.equity.usdToIlsRate).toBe(3.3);
    expect(result.equity.usdToIlsRateDate).toBeNull();
  });

  it("keeps saved comparison ages and drops malformed ones", () => {
    const profile = buildTestProfile({ age: 40 });
    expect(normalizeProfile({ ...profile, comparisonAges: [58, 62, 70] }).comparisonAges).toEqual([58, 62, 70]);
    expect(normalizeProfile(profile).comparisonAges).toBeNull();

    for (const bad of [[58, 62], [58, 62, 70, 72], [58, "62", 70], [58, null, 70], [58, Number.NaN, 70], "58,62,70"]) {
      expect(
        normalizeProfile({ ...profile, comparisonAges: bad } as unknown as Parameters<typeof normalizeProfile>[0])
          .comparisonAges,
      ).toBeNull();
    }
  });

  it("adds an empty report list and no report link to a profile saved before reports were recorded", () => {
    const profile = buildTestProfile({ age: 40, pensionBalances: [1000] });
    const { reports: _reports, ...savings } = profile.pensionSavings;
    const legacyAccount = { ...savings.accounts[0] } as Record<string, unknown>;
    delete legacyAccount.reportId;
    const result = normalizeProfile({
      ...profile,
      pensionSavings: { ...savings, accounts: [legacyAccount] },
    } as unknown as Parameters<typeof normalizeProfile>[0]);
    expect(result.pensionSavings.reports).toEqual([]);
    expect(result.pensionSavings.accounts[0].reportId).toBeNull();
  });

  it("keeps well-formed report records and drops malformed ones", () => {
    const profile = buildTestProfile({ age: 40 });
    const good = {
      id: "r1",
      owner: "spouse",
      personKeys: ["k1", "", 7, "k2"],
      firstName: "Dana",
      ageAtImport: 46,
      reportDate: "2026-05-01",
      importedAt: "2026-05-02",
      sample: false,
    };
    const result = normalizeProfile({
      ...profile,
      pensionSavings: { ...profile.pensionSavings, reports: [good, null, "text", { owner: "self" }, { id: "" }, { id: "r2" }] },
    } as unknown as Parameters<typeof normalizeProfile>[0]);
    expect(result.pensionSavings.reports).toEqual([
      { ...good, personKeys: ["k1", "k2"] },
      {
        id: "r2",
        owner: "self",
        personKeys: [],
        firstName: null,
        ageAtImport: null,
        reportDate: null,
        importedAt: "",
        sample: false,
      },
    ]);
  });

  it("treats a report list that is not a list as empty", () => {
    const profile = buildTestProfile({ age: 40 });
    const result = normalizeProfile({
      ...profile,
      pensionSavings: { ...profile.pensionSavings, reports: "nope" },
    } as unknown as Parameters<typeof normalizeProfile>[0]);
    expect(result.pensionSavings.reports).toEqual([]);
  });

  describe("expenses", () => {
    const withExpenses = (expenses: unknown) =>
      normalizeProfile({
        ...buildTestProfile({ age: 40 }),
        expenses,
      } as unknown as Parameters<typeof normalizeProfile>[0]).expenses;

    it("opens a profile saved before itemised expenses in one-total mode and drops today's figure", () => {
      expect(withExpenses({ currentMonthly: 20_000, retirementMonthly: 15_000 })).toEqual({
        mode: "totals",
        retirementMonthly: 15_000,
        items: [],
      });
    });

    it("gives a profile with no expenses at all the empty ones", () => {
      expect(withExpenses(undefined)).toEqual({ mode: "totals", retirementMonthly: null, items: [] });
    });

    it("keeps a well-formed itemised list", () => {
      const item = {
        id: "e1",
        catalogKey: "arnona",
        name: "Arnona",
        category: "housing",
        amount: 1_800,
        frequency: "bimonthly",
        everyYears: null,
        necessity: "essential",
        notes: "Tel Aviv",
      };
      expect(withExpenses({ mode: "detailed", retirementMonthly: 9_000, items: [item] })).toEqual({
        mode: "detailed",
        retirementMonthly: 9_000,
        items: [item],
      });
    });

    it("repairs bad item fields and drops entries that are not items", () => {
      const { items, mode } = withExpenses({
        mode: "whatever",
        items: [
          null,
          "text",
          { name: "no id" },
          {
            id: "e2",
            catalogKey: 5,
            name: 7,
            category: "nonsense",
            amount: "12",
            frequency: "weekly",
            everyYears: -2,
            necessity: "maybe",
            notes: null,
          },
        ],
      });
      expect(mode).toBe("totals");
      expect(items).toEqual([
        {
          id: "e2",
          catalogKey: null,
          name: "",
          category: "other",
          amount: null,
          frequency: "monthly",
          everyYears: null,
          necessity: "essential",
          notes: "",
        },
      ]);
    });

    it("treats a list that is not a list as empty", () => {
      expect(withExpenses({ mode: "detailed", items: "nope" }).items).toEqual([]);
    });
  });
});
