import type { ProfileData } from "../types";
import { EMPTY_PROFILE } from "../types";

/**
 * Builds a `ProfileData` for domain-engine tests, starting from
 * `EMPTY_PROFILE` and applying a deep-ish partial override. Lives under
 * `src/test/` (excluded from the production build, see tsconfig.app.json)
 * since it only exists to make domain tests readable.
 */
export function buildTestProfile(overrides: {
  age?: number;
  retirementAge?: number;
  investmentReturnPct?: number;
  inflationPct?: number;
  pensionBalances?: number[];
  otherAssets?: number;
  equity?: { quantity: number; priceUSD: number }[];
  currentMonthlyExpenses?: number;
  retirementMonthlyExpenses?: number;
}): ProfileData {
  const {
    age,
    retirementAge,
    investmentReturnPct,
    inflationPct,
    pensionBalances = [],
    otherAssets,
    equity = [],
    currentMonthlyExpenses,
    retirementMonthlyExpenses,
  } = overrides;

  return {
    ...EMPTY_PROFILE,
    personal: {
      ...EMPTY_PROFILE.personal,
      age: age ?? null,
      retirementAge: retirementAge ?? null,
    },
    pensionSavings: {
      accounts: pensionBalances.map((balance, index) => ({
        id: `test-account-${index}`,
        providerName: "Test Provider",
        productCategory: null,
        legacyPolicyModel: null,
        accountStatus: null,
        joinDate: null,
        liquidityDate: null,
        totalAccumulatedBalance: balance,
        balanceBreakdown: {
          pre2008CapitalBalance: null,
          post2008AnnuityBalance: null,
          tikun190CapitalBalance: null,
          severanceBalance: null,
        },
        annuityParameters: {
          hasGuaranteedFactor: false,
          conversionFactor: null,
          estimatedMonthlyAnnuity: null,
          annuityTaxType: null,
          guaranteedPaymentMonths: null,
        },
        insuranceCoverages: {
          deathCoverageAmount: null,
          monthlyDisabilityAmount: null,
          monthlyRiskDeduction: null,
        },
        investmentAndFees: {
          investmentTrackName: "",
          feeFromAccumulationPercent: null,
          feeFromDepositPercent: null,
          profitSharingFeePercent: null,
          hasStateYieldGuarantee: false,
        },
      })),
      otherAssets: otherAssets ?? null,
    },
    equity: {
      holdings: equity.map((holding, index) => ({
        id: `test-holding-${index}`,
        investmentCategory: null,
        tickerSymbol: "TEST",
        companyName: "Test Co",
        custodianOrBroker: "",
        quantity: holding.quantity,
        currentMarketPriceUSD: holding.priceUSD,
        employerGrantDetails: {
          grantDate: null,
          taxTrack: null,
          vestedQuantity: null,
          unvestedQuantity: null,
          trusteeHoldingPeriodMet: false,
          costBasisAtGrantUSD: null,
          estimatedMarginalTaxOnVesting: null,
        },
        esppDetails: {
          purchaseDate: null,
          discountPercentage: null,
          purchasePriceUSD: null,
          fairMarketValueAtPurchaseUSD: null,
          taxedDiscountValueUSD: null,
          capitalGainsOnGrowthUSD: null,
        },
        personalPurchaseDetails: {
          purchaseDate: null,
          averageCostBasisUSD: null,
          unrealizedCapitalGainUSD: null,
          capitalGainsTaxRatePercent: null,
        },
      })),
    },
    expenses: {
      currentMonthly: currentMonthlyExpenses ?? null,
      retirementMonthly: retirementMonthlyExpenses ?? null,
    },
    assumptions: {
      preset: "base",
      investmentReturnPct: investmentReturnPct ?? EMPTY_PROFILE.assumptions.investmentReturnPct,
      inflationPct: inflationPct ?? EMPTY_PROFILE.assumptions.inflationPct,
    },
  };
}
