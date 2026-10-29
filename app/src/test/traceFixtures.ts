import type { AnnuityParameters, ProfileData } from "../types";
import { buildTestProfile } from "./domainFixtures";

const NO_ANNUITY: AnnuityParameters = {
  hasGuaranteedFactor: false,
  conversionFactor: null,
  estimatedMonthlyAnnuity: null,
  annuityTaxType: null,
  guaranteedPaymentMonths: null,
};

const CONTRIBUTING = {
  accountStatus: "activeContributing" as const,
  contributions: {
    monthlySalaryBase: null,
    employeeRatePercent: 6,
    employerRatePercent: 6.5,
    severanceRatePercent: 6,
  },
};

/**
 * An invented couple that exercises every part of the calculation trace:
 * a pension fund with and without a conversion factor, a study fund, an
 * investment provident fund, a managers insurance with a guaranteed factor,
 * a spouse account, other assets, a personal holding and an employer grant.
 * All values are made up.
 */
export function buildTraceCouple(): ProfileData {
  return buildTestProfile({
    age: 45,
    gender: "male",
    retirementAge: 62,
    monthlyGrossSalary: 30_000,
    maritalStatus: "married",
    creditPoints: 2.25,
    bituachLeumi: { includeInProjection: true, insuredYearsToDate: 20 },
    spouse: {
      age: 43,
      gender: "female",
      retirementAge: 64,
      monthlyGrossSalary: 12_000,
      creditPoints: 2.75,
      bituachLeumi: { includeInProjection: true },
    },
    investmentReturnPct: 5,
    inflationPct: 2,
    pensionBalances: [400_000, 150_000, 80_000, 120_000, 90_000, 60_000],
    pensionAccountOverrides: [
      {
        productCategory: "comprehensivePension",
        ...CONTRIBUTING,
        annuityParameters: { ...NO_ANNUITY, conversionFactor: 200 },
      },
      {
        productCategory: "studyFund",
        joinDate: "2018-01-01",
        ...CONTRIBUTING,
        annuityParameters: NO_ANNUITY,
      },
      { productCategory: "investmentProvidentFund", annuityParameters: NO_ANNUITY },
      {
        productCategory: "managersInsurance",
        accountStatus: "paidUpFrozen",
        annuityParameters: { ...NO_ANNUITY, hasGuaranteedFactor: true, conversionFactor: 210 },
      },
      {
        owner: "spouse",
        productCategory: "generalPension",
        ...CONTRIBUTING,
        annuityParameters: { ...NO_ANNUITY, estimatedMonthlyAnnuity: 1_500 },
      },
      { owner: "spouse", productCategory: "providentFund", annuityParameters: NO_ANNUITY },
    ],
    otherAssets: 50_000,
    equity: [
      { quantity: 100, priceUSD: 50, unrealizedCapitalGainUSD: 1_000, capitalGainsTaxRatePercent: 25 },
      {
        quantity: 200,
        priceUSD: 40,
        employerGrant: {
          taxTrack: "section102CapitalGainsTrustee",
          grantPriceUSD: 20,
          vestingTranches: [
            { vestDate: "2024-01-01", quantity: 120, grantPriceUSD: 20 },
            { vestDate: "2027-01-01", quantity: 80, grantPriceUSD: 25 },
          ],
        },
      },
    ],
    currentMonthlyExpenses: 25_000,
    retirementMonthlyExpenses: 18_000,
  });
}
