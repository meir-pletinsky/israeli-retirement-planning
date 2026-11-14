import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { buildHousehold, resolveRetirementTiming } from "./household";
import { INCOME_BAND_KEYS, recurringAmount, type IncomeBreakdownPoint } from "./incomeBreakdown";
import { incomeYearDetails, type IncomeBasis, type IncomeYearDetail } from "./incomeSources";
import { OTHER_INVESTMENTS_SOURCE_ID, investmentParts } from "./sources";
import { evaluateWhatIf, applyWhatIf, baselineWhatIf } from "./whatIf";

const ANNUITY = {
  hasGuaranteedFactor: true,
  conversionFactor: null,
  estimatedMonthlyAnnuity: 5_000,
  annuityTaxType: null,
  guaranteedPaymentMonths: null,
};

const buildCouple = (spouseRetirementAge: number) =>
  buildTestProfile({
    age: 55,
    retirementAge: 58,
    monthlyGrossSalary: 20_000,
    maritalStatus: "married",
    pensionBalances: [1_500_000, 700_000, 400_000, 300_000],
    pensionAccountOverrides: [
      {
        providerName: "Migdal",
        policyNumber: "P-100",
        productCategory: "comprehensivePension",
        annuityParameters: ANNUITY,
      },
      { providerName: "Altshuler", productCategory: "providentFund" },
      { owner: "spouse", providerName: "Clal", productCategory: "comprehensivePension" },
      { owner: "spouse", providerName: "Harel", productCategory: "providentFund" },
    ],
    otherAssets: 250_000,
    bankDeposits: [{ amount: 200_000, bankName: "Leumi" }],
    equity: [
      { quantity: 500, priceUSD: 100, ticker: "ACME", unrealizedCapitalGainUSD: 10_000 },
      { quantity: 200, priceUSD: 50, ticker: "BETA", unrealizedCapitalGainUSD: 2_000 },
    ],
    usdToIlsRate: { rate: 3.6 },
    retirementMonthlyExpenses: 12_000,
    investmentReturnPct: 6,
    inflationPct: 2.5,
    bituachLeumi: { includeInProjection: true },
    spouse: {
      age: 52,
      retirementAge: spouseRetirementAge,
      monthlyGrossSalary: 12_000,
      bituachLeumi: { includeInProjection: true },
    },
  });

/** Both retire at the same time. */
const couple = buildCouple(55);

function chartPoints(profile: typeof couple, basis: IncomeBasis): IncomeBreakdownPoint[] {
  const outcome = evaluateWhatIf(profile);
  return basis === "planned" && outcome.cashFlow ? outcome.cashFlow.years : outcome.income;
}

function bandSum(detail: IncomeYearDetail, band: string, mode: "payment" | "withdrawal"): number {
  return detail.lines
    .filter((line) => line.band === band && line.mode === mode)
    .reduce((sum, line) => sum + line.monthly, 0);
}

describe("incomeYearDetails", () => {
  it.each([
    ["planned", 55],
    ["sustainable", 55],
    ["planned", 62],
    ["sustainable", 62],
  ] as const)("adds up to the %s chart, band by band, with the spouse retiring at %i", (basis, spouseAge) => {
    const profile = buildCouple(spouseAge);
    const details = incomeYearDetails(profile, basis);
    const points = chartPoints(profile, basis);
    expect(details.map((detail) => detail.age)).toEqual(points.map((point) => point.age));
    expect(details.length).toBeGreaterThan(10);

    details.forEach((detail, index) => {
      const point = points[index];
      for (const band of INCOME_BAND_KEYS) {
        expect(bandSum(detail, band, "payment")).toBe(recurringAmount(point, band));
        expect(bandSum(detail, band, "withdrawal")).toBe(point.withdrawn[band]);
      }
      expect(detail.total).toBe(detail.lines.reduce((sum, line) => sum + line.monthly, 0));
      expect(detail.unfunded).toBe(basis === "planned" ? point.unfunded : null);
    });
  });

  it("names each fund and who owns it", () => {
    const details = incomeYearDetails(couple, "sustainable");
    const late = details[details.length - 1];
    const accounts = late.lines.flatMap(({ origin, owner }) =>
      origin.type === "account" ? [`${owner}:${origin.providerName}`] : [],
    );
    expect(accounts).toEqual(expect.arrayContaining(["self:Migdal", "self:Altshuler"]));
    expect(late.lines.some(({ origin }) => origin.type === "bituachLeumi")).toBe(true);
    expect(late.spouseAge).toBe(late.age - 3);
  });

  it("splits the investments pool into the pieces the profile lists", () => {
    const first = incomeYearDetails(couple, "sustainable")[0];
    const pool = first.lines.filter(({ band }) => band === "investments");
    const origins = pool.map(({ origin }) => origin.type);
    expect(origins).toEqual(expect.arrayContaining(["otherAssets", "bankDeposit", "holding"]));
    expect(pool.find(({ origin }) => origin.type === "bankDeposit")?.origin).toMatchObject({ bankName: "Leumi" });
    expect(pool.every(({ mode, balance }) => mode === "withdrawal" && balance !== null && balance > 0)).toBe(true);
  });

  it("lists a source that is locked or starts later as idle, with the owner's age", () => {
    const [first] = incomeYearDetails(couple, "sustainable");
    const migdal = first.idle.find(({ origin }) => origin.type === "account" && origin.providerName === "Migdal");
    expect(migdal?.reason).toEqual({ type: "startsLater", age: 60 });
    const clal = first.idle.find(({ origin }) => origin.type === "account" && origin.providerName === "Clal");
    expect(clal?.reason).toEqual({ type: "locked", age: 60 });
    expect(first.idle.some(({ owner, origin }) => owner === "self" && origin.type === "bituachLeumi")).toBe(true);
  });

  it("shows an annuity as a payment once it has started", () => {
    const details = incomeYearDetails(couple, "planned");
    const atSixty = details.find((detail) => detail.age === 60);
    const migdal = atSixty?.lines.find(
      ({ origin }) => origin.type === "account" && origin.providerName === "Migdal",
    );
    expect(migdal).toMatchObject({ mode: "payment", band: "pensionFund", monthly: 5_000, owner: "self" });
  });

  it("falls back to the sustainable income when no spending is planned", () => {
    const noSpending = buildTestProfile({ age: 55, retirementAge: 60, pensionBalances: [1_500_000] });
    expect(incomeYearDetails(noSpending, "planned")).toEqual(incomeYearDetails(noSpending, "sustainable"));
  });

  it("carries the planned spending on the planned basis only", () => {
    const years = evaluateWhatIf(couple).cashFlow!.years;
    const planned = incomeYearDetails(couple, "planned");
    expect(planned.map((detail) => detail.planned)).toEqual(years.map((year) => year.spending + year.cover));
    expect(incomeYearDetails(couple, "sustainable").every((detail) => detail.planned === null)).toBe(true);
  });

  it("lists what bears on a withdrawal, and nothing on a payment", () => {
    const profile = {
      ...couple,
      bankDeposits: [
        {
          ...couple.bankDeposits[0],
          rateType: "variable" as const,
          annualInterestRatePercent: 4,
          cpiLinked: true,
          maturityDate: "2030-01-01",
          autoRenew: true,
        },
      ],
    };
    const lines = incomeYearDetails(profile, "planned").flatMap((detail) => detail.lines);
    expect(lines.filter(({ mode }) => mode === "payment").every(({ factors }) => factors === null)).toBe(true);
    const withdrawals = lines.filter(({ mode }) => mode === "withdrawal");
    expect(withdrawals.length).toBeGreaterThan(0);
    expect(withdrawals.every(({ factors }) => factors !== null)).toBe(true);

    const originOf = (type: string) => withdrawals.find(({ origin }) => origin.type === type);
    expect(originOf("bankDeposit")?.factors).toMatchObject({
      currency: "ILS",
      deposit: {
        rateType: "variable",
        annualInterestPct: 4,
        cpiLinked: true,
        maturityDate: "2030-01-01",
        autoRenew: true,
      },
    });
    expect(originOf("holding")?.factors).toMatchObject({ currency: "USD", deposit: null });
    expect(originOf("otherAssets")?.factors).toMatchObject({ currency: "ILS", deposit: null });
    expect(originOf("account")?.factors?.treatment).toBeDefined();
  });
});

describe("incomeYearDetails with a later pension start", () => {
  const ANNUITY_3K = { ...ANNUITY, estimatedMonthlyAnnuity: 3_000 };
  const saved = buildTestProfile({
    age: 55,
    retirementAge: 60,
    pensionBalances: [1_500_000, 1_000_000],
    pensionAccountOverrides: [
      { providerName: "Migdal", productCategory: "comprehensivePension", annuityParameters: ANNUITY },
      { owner: "spouse", providerName: "Clal", productCategory: "comprehensivePension", annuityParameters: ANNUITY_3K },
    ],
    otherAssets: 2_000_000,
    retirementMonthlyExpenses: 14_000,
    maritalStatus: "married",
    spouse: { age: 55, retirementAge: 60 },
  });

  const bridgeAt = (profile: typeof saved, age: number) => {
    const detail = incomeYearDetails(profile, "planned").find((year) => year.age === age)!;
    const drawn = detail.lines
      .filter(({ mode }) => mode === "withdrawal")
      .reduce((sum, line) => sum + line.monthly, 0);
    const annuityOf = (owner: "self" | "spouse") =>
      detail.lines.find(({ owner: lineOwner, mode, origin }) => lineOwner === owner && mode === "payment" && origin.type === "account")
        ?.monthly ?? 0;
    return { drawn, self: annuityOf("self"), spouse: annuityOf("spouse") };
  };

  it("draws more from savings in the years before the primary user's pension starts", () => {
    const early = bridgeAt(saved, 62);
    const late = bridgeAt(applyWhatIf(saved, { ...baselineWhatIf(saved), pensionStartAge: 66 }), 62);
    expect(early.self).toBe(5_000);
    expect(late.self).toBe(0);
    expect(late.drawn - early.drawn).toBeGreaterThanOrEqual(4_990);
    const after = bridgeAt(applyWhatIf(saved, { ...baselineWhatIf(saved), pensionStartAge: 66 }), 66);
    expect(after.self).toBeGreaterThan(0);
  });

  it("does the same when only the partner's pension starts later", () => {
    const early = bridgeAt(saved, 62);
    const late = bridgeAt(applyWhatIf(saved, { ...baselineWhatIf(saved), spousePensionStartAge: 66 }), 62);
    expect(early.spouse).toBe(3_000);
    expect(late.spouse).toBe(0);
    expect(late.self).toBe(early.self);
    expect(late.drawn - early.drawn).toBeGreaterThanOrEqual(2_990);
  });
});


describe("investmentParts", () => {
  it("adds up to the investments source balance", () => {
    const household = buildHousehold(couple, resolveRetirementTiming(couple, "standard"));
    const [self] = household.members;
    const pool = self.sources.find(({ id }) => id === OTHER_INVESTMENTS_SOURCE_ID);
    const parts = investmentParts(self.profile, self.retirementAge);
    expect(parts.length).toBeGreaterThanOrEqual(4);
    expect(parts.reduce((sum, part) => sum + part.value, 0)).toBeCloseTo(pool?.balance ?? NaN, 6);
  });
});
