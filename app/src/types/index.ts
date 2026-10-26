export type Gender = "male" | "female";

export type MaritalStatus = "single" | "married" | "divorced" | "widowed";

export type AssumptionPreset = "conservative" | "base" | "optimistic";

export interface Assumptions {
  preset: AssumptionPreset;
  investmentReturnPct: number;
  inflationPct: number;
}

export const ASSUMPTION_PRESETS: Record<
  AssumptionPreset,
  { investmentReturnPct: number; inflationPct: number }
> = {
  conservative: { investmentReturnPct: 4, inflationPct: 4 },
  base: { investmentReturnPct: 6, inflationPct: 2.5 },
  optimistic: { investmentReturnPct: 8, inflationPct: 1.5 },
};

export interface PersonalData {
  age: number | null;
  gender: Gender | null;
  retirementAge: number | null;
  maritalStatus: MaritalStatus | null;
  /** Total personal tax credit points (Nekudot Zikui). */
  creditPoints: number | null;
  /** Gross monthly salary in today's money; basis for ongoing pension/savings contributions. */
  monthlyGrossSalary: number | null;
}

/** Tax exemption tracking under Kibua Zchuyot (Form 161D). Optional — most users won't know these yet. */
export interface TaxExemptionBasket {
  form161DSubmitted: boolean;
  pastTaxFreeSeveranceWithdrawn: number | null;
  remainingMonthlyExemptionCap: number | null;
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// --- Pension & savings accounts -------------------------------------------------

export type ProductCategory =
  | "comprehensivePension"
  | "generalPension"
  | "managersInsurance"
  | "providentFund"
  | "investmentProvidentFund"
  | "studyFund"
  | "iraProvidentFund";

export type LegacyPolicyModel =
  | "none"
  | "adif"
  | "meitav"
  | "profitSharing1992"
  | "budgetary";

export type AccountStatus =
  | "activeContributing"
  | "paidUpFrozen"
  | "payingAnnuity";

export type AnnuityTaxType = "recognizedAnnuity" | "qualifyingAnnuity";

export type GuaranteedPaymentMonths = 0 | 60 | 120 | 180 | 240;

export interface BalanceBreakdown {
  pre2008CapitalBalance: number | null;
  post2008AnnuityBalance: number | null;
  tikun190CapitalBalance: number | null;
  severanceBalance: number | null;
}

export interface AnnuityParameters {
  hasGuaranteedFactor: boolean;
  conversionFactor: number | null;
  estimatedMonthlyAnnuity: number | null;
  annuityTaxType: AnnuityTaxType | null;
  guaranteedPaymentMonths: GuaranteedPaymentMonths | null;
}

export interface InsuranceCoverages {
  deathCoverageAmount: number | null;
  monthlyDisabilityAmount: number | null;
  monthlyRiskDeduction: number | null;
}

export interface InvestmentAndFees {
  investmentTrackName: string;
  feeFromAccumulationPercent: number | null;
  feeFromDepositPercent: number | null;
  profitSharingFeePercent: number | null;
  hasStateYieldGuarantee: boolean;
}

/** Ongoing deposit rates into an account, each as a percent of gross monthly salary. */
export interface AccountContributions {
  employeeRatePercent: number | null;
  employerRatePercent: number | null;
  severanceRatePercent: number | null;
}

export const EMPTY_ACCOUNT_CONTRIBUTIONS: AccountContributions = {
  employeeRatePercent: null,
  employerRatePercent: null,
  severanceRatePercent: null,
};

export interface PensionAccount {
  id: string;
  providerName: string;
  productCategory: ProductCategory | null;
  legacyPolicyModel: LegacyPolicyModel | null;
  accountStatus: AccountStatus | null;
  joinDate: string | null;
  liquidityDate: string | null;
  totalAccumulatedBalance: number | null;
  contributions: AccountContributions;
  balanceBreakdown: BalanceBreakdown;
  annuityParameters: AnnuityParameters;
  insuranceCoverages: InsuranceCoverages;
  investmentAndFees: InvestmentAndFees;
}

export function createEmptyPensionAccount(): PensionAccount {
  return {
    id: createId(),
    providerName: "",
    productCategory: null,
    legacyPolicyModel: null,
    accountStatus: null,
    joinDate: null,
    liquidityDate: null,
    totalAccumulatedBalance: null,
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
  };
}

export interface PensionSavingsData {
  accounts: PensionAccount[];
  /** Catch-all for assets not covered above (cash, bonds, real estate, etc.). */
  otherAssets: number | null;
}

// --- Equity & stock investments --------------------------------------------------

export type InvestmentCategory =
  | "employerGrantedStock"
  | "employerEsppDiscount"
  | "personalBrokeragePurchase";

export type TaxTrack =
  | "section102CapitalGainsTrustee"
  | "section102OrdinaryIncomeTrustee"
  | "section3iNonTrustee";

export interface EmployerGrantDetails {
  grantDate: string | null;
  taxTrack: TaxTrack | null;
  vestedQuantity: number | null;
  unvestedQuantity: number | null;
  /** True once the mandatory 24-month Section 102 trustee lockup period has passed. */
  trusteeHoldingPeriodMet: boolean;
  costBasisAtGrantUSD: number | null;
  estimatedMarginalTaxOnVesting: number | null;
}

export interface EsppDetails {
  purchaseDate: string | null;
  discountPercentage: number | null;
  purchasePriceUSD: number | null;
  fairMarketValueAtPurchaseUSD: number | null;
  taxedDiscountValueUSD: number | null;
  capitalGainsOnGrowthUSD: number | null;
}

export interface PersonalPurchaseDetails {
  purchaseDate: string | null;
  averageCostBasisUSD: number | null;
  unrealizedCapitalGainUSD: number | null;
  capitalGainsTaxRatePercent: number | null;
}

export interface StockHolding {
  id: string;
  investmentCategory: InvestmentCategory | null;
  tickerSymbol: string;
  companyName: string;
  custodianOrBroker: string;
  quantity: number | null;
  currentMarketPriceUSD: number | null;
  employerGrantDetails: EmployerGrantDetails;
  esppDetails: EsppDetails;
  personalPurchaseDetails: PersonalPurchaseDetails;
}

export function createEmptyStockHolding(): StockHolding {
  return {
    id: createId(),
    investmentCategory: null,
    tickerSymbol: "",
    companyName: "",
    custodianOrBroker: "",
    quantity: null,
    currentMarketPriceUSD: null,
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
      capitalGainsTaxRatePercent: 25,
    },
  };
}

export interface EquityData {
  holdings: StockHolding[];
}

export interface ExpensesData {
  currentMonthly: number | null;
  retirementMonthly: number | null;
}

/** Inputs for the Bituach Leumi (National Insurance) old-age pension estimate. */
export interface BituachLeumiData {
  /** When false, the estimated state pension is left out of all retirement income projections. */
  includeInProjection: boolean;
  /** Full insured/resident years accrued so far; null = assume insured continuously since age 21. */
  insuredYearsToDate: number | null;
  /** Monthly pension in today's money from Bituach Leumi's own calculator; replaces the computed estimate when set. */
  monthlyPensionOverride: number | null;
}

export const EMPTY_BITUACH_LEUMI: BituachLeumiData = {
  includeInProjection: true,
  insuredYearsToDate: null,
  monthlyPensionOverride: null,
};

export interface ProfileData {
  personal: PersonalData;
  taxExemptionBasket: TaxExemptionBasket;
  bituachLeumi: BituachLeumiData;
  pensionSavings: PensionSavingsData;
  equity: EquityData;
  expenses: ExpensesData;
  assumptions: Assumptions;
}

export const EMPTY_PROFILE: ProfileData = {
  personal: {
    age: null,
    gender: null,
    retirementAge: null,
    maritalStatus: null,
    creditPoints: null,
    monthlyGrossSalary: null,
  },
  taxExemptionBasket: {
    form161DSubmitted: false,
    pastTaxFreeSeveranceWithdrawn: null,
    remainingMonthlyExemptionCap: null,
  },
  bituachLeumi: { ...EMPTY_BITUACH_LEUMI },
  pensionSavings: { accounts: [], otherAssets: null },
  equity: { holdings: [] },
  expenses: { currentMonthly: null, retirementMonthly: null },
  assumptions: { preset: "base", ...ASSUMPTION_PRESETS.base },
};

/**
 * Defensively merges a possibly-partial/stale profile object (from an older
 * localStorage build, a hand-edited JSON import, etc.) onto `EMPTY_PROFILE`
 * so missing or mis-shaped fields fall back to safe defaults instead of
 * crashing the app.
 */
export function normalizeProfile(parsed: Partial<ProfileData> | null | undefined): ProfileData {
  const merged: ProfileData = {
    ...EMPTY_PROFILE,
    ...parsed,
    personal: { ...EMPTY_PROFILE.personal, ...parsed?.personal },
    taxExemptionBasket: {
      ...EMPTY_PROFILE.taxExemptionBasket,
      ...parsed?.taxExemptionBasket,
    },
    bituachLeumi: { ...EMPTY_PROFILE.bituachLeumi, ...parsed?.bituachLeumi },
    expenses: { ...EMPTY_PROFILE.expenses, ...parsed?.expenses },
    assumptions: { ...EMPTY_PROFILE.assumptions, ...parsed?.assumptions },
  };
  // Guard against the pre-schema-expansion shape (plain numeric fields
  // instead of an accounts/holdings array).
  if (!Array.isArray(merged.pensionSavings?.accounts)) {
    merged.pensionSavings = EMPTY_PROFILE.pensionSavings;
  } else {
    // Accounts saved before contribution rates existed lack `contributions`.
    merged.pensionSavings = {
      ...merged.pensionSavings,
      accounts: merged.pensionSavings.accounts.map((account) => ({
        ...account,
        contributions: {
          ...EMPTY_ACCOUNT_CONTRIBUTIONS,
          ...account.contributions,
        },
      })),
    };
  }
  if (!Array.isArray(merged.equity?.holdings)) {
    merged.equity = EMPTY_PROFILE.equity;
  }
  return merged;
}

export type RetirementScenario = "standard" | "early" | "delayed";
