import type {
  BituachLeumiData,
  Gender,
  MaritalStatus,
  PensionAccount,
  ProfileData,
  SpouseData,
} from "../types";
import { EMPTY_ACCOUNT_CONTRIBUTIONS, EMPTY_PROFILE, EMPTY_SPOUSE } from "../types";

/**
 * Builds a `ProfileData` for domain-engine tests, starting from
 * `EMPTY_PROFILE` and applying a deep-ish partial override. Lives under
 * `src/test/` (excluded from the production build, see tsconfig.app.json)
 * since it only exists to make domain tests readable.
 */
export function buildTestProfile(overrides: {
  age?: number;
  gender?: Gender;
  retirementAge?: number;
  monthlyGrossSalary?: number;
  maritalStatus?: MaritalStatus;
  /** Spouse basics; the household is active once `maritalStatus` is "married" and `spouse.age` is set. */
  spouse?: Partial<Omit<SpouseData, "bituachLeumi">> & {
    /** Excluded from projections by default, like the primary user's. */
    bituachLeumi?: Partial<BituachLeumiData>;
  };
  /** Bituach Leumi inputs; excluded from projections by default so other tests stay isolated from it. */
  bituachLeumi?: Partial<BituachLeumiData>;
  investmentReturnPct?: number;
  inflationPct?: number;
  pensionBalances?: number[];
  /** Index-aligned with `pensionBalances`; merged onto each generated account. */
  pensionAccountOverrides?: Partial<PensionAccount>[];
  otherAssets?: number;
  equity?: { quantity: number; priceUSD: number }[];
  currentMonthlyExpenses?: number;
  retirementMonthlyExpenses?: number;
}): ProfileData {
  const {
    age,
    gender,
    retirementAge,
    monthlyGrossSalary,
    maritalStatus,
    spouse,
    bituachLeumi,
    investmentReturnPct,
    inflationPct,
    pensionBalances = [],
    pensionAccountOverrides = [],
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
      gender: gender ?? null,
      retirementAge: retirementAge ?? null,
      monthlyGrossSalary: monthlyGrossSalary ?? null,
      maritalStatus: maritalStatus ?? null,
    },
    spouse: {
      ...EMPTY_SPOUSE,
      ...spouse,
      bituachLeumi: {
        ...EMPTY_SPOUSE.bituachLeumi,
        includeInProjection: false,
        ...spouse?.bituachLeumi,
      },
    },
    bituachLeumi: { ...EMPTY_PROFILE.bituachLeumi, includeInProjection: false, ...bituachLeumi },
    pensionSavings: {
      accounts: pensionBalances.map((balance, index) => ({
        id: `test-account-${index}`,
        owner: "self" as const,
        providerName: "Test Provider",
        productCategory: null,
        legacyPolicyModel: null,
        accountStatus: null,
        joinDate: null,
        liquidityDate: null,
        totalAccumulatedBalance: balance,
        contributions: { ...EMPTY_ACCOUNT_CONTRIBUTIONS },
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
        ...pensionAccountOverrides[index],
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
