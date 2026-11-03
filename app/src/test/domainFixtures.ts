import type {
  BankDeposit,
  BankDepositRateType,
  BituachLeumiData,
  ExpenseItem,
  Gender,
  InvestmentCategory,
  MaritalStatus,
  PensionAccount,
  ProfileData,
  SpouseData,
  TaxExemptionBasket,
  TaxTrack,
  WithdrawalStrategy,
} from "../types";
import {
  EMPTY_ACCOUNT_CONTRIBUTIONS,
  EMPTY_PROFILE,
  EMPTY_SPOUSE,
  createEmptyExpenseItem,
} from "../types";

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
  creditPoints?: number;
  taxExemptionBasket?: Partial<TaxExemptionBasket>;
  /** Spouse basics; the household is active once `maritalStatus` is "married" and `spouse.age` is set. */
  spouse?: Partial<Omit<SpouseData, "bituachLeumi">> & {
    /** Excluded from projections by default, like the primary user's. */
    bituachLeumi?: Partial<BituachLeumiData>;
  };
  /** Bituach Leumi inputs; excluded from projections by default so other tests stay isolated from it. */
  bituachLeumi?: Partial<BituachLeumiData>;
  investmentReturnPct?: number;
  inflationPct?: number;
  /** Standard deviation of yearly returns for the Monte Carlo; defaults to the app's default. */
  volatilityPct?: number;
  /** The order the plan draws on unlocked savings; defaults to pro rata. */
  withdrawalStrategy?: WithdrawalStrategy;
  pensionAccountOverrides?: Partial<PensionAccount>[];
  otherAssets?: number;
  /** Shekels per US dollar valuing the equity; with a date it is a looked-up rate, without one the user's own. */
  usdToIlsRate?: { rate: number; date?: string };
  equity?: {
    quantity: number;
    priceUSD: number;
    /** Defaults to employer-granted when `employerGrant` is set, otherwise to no category. */
    category?: InvestmentCategory;
    ticker?: string;
    /** The purchase or grant: its date and the share price that day, saved in the category's own fields. */
    entry?: { date?: string; priceUSD?: number; usdToIlsRate?: number };
    unrealizedCapitalGainUSD?: number;
    capitalGainsTaxRatePercent?: number;
    /** Purchases of an ESPP or private holding; their cost replaces the unrealized gain. */
    purchaseLots?: { date?: string; quantity: number; priceUSD: number; usdToIlsRate?: number }[];
    /** Makes the holding an employer grant, with these details. */
    employerGrant?: {
      taxTrack?: TaxTrack;
      /** Share price at the grant date. */
      grantPriceUSD?: number;
      grantDate?: string;
      holdingPeriodMet?: boolean;
      /** Batches of the quantity with their own vesting date and grant price. */
      vestingTranches?: { vestDate?: string; quantity: number; grantPriceUSD?: number }[];
      /** The plan lets unvested batches keep vesting after leaving. */
      keepsVestingAfterLeaving?: boolean;
    };
  }[];
  /** Typed monthly spending in retirement (totals mode). */
  retirementMonthlyExpenses?: number;
  /** Itemised retirement expenses; setting any switches the profile to detailed mode. */
  expenseItems?: Partial<ExpenseItem>[];
  /** The retirement ages saved from the Projections comparison. */
  comparisonAges?: [number, number, number];
  bankDeposits?: {
    amount: number;
    startDate?: string;
    rateType?: BankDepositRateType;
    annualInterestRatePercent?: number;
    cpiLinked?: boolean;
    bankName?: string;
    maturityDate?: string;
    autoRenew?: boolean;
  }[];
}): ProfileData {
  const {
    age,
    gender,
    retirementAge,
    monthlyGrossSalary,
    maritalStatus,
    creditPoints,
    taxExemptionBasket,
    spouse,
    bituachLeumi,
    investmentReturnPct,
    inflationPct,
    volatilityPct,
    withdrawalStrategy,
    pensionBalances = [],
    pensionAccountOverrides = [],
    otherAssets,
    usdToIlsRate,
    equity = [],
    retirementMonthlyExpenses,
    expenseItems,
    comparisonAges,
    bankDeposits = [],
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
      creditPoints: creditPoints ?? null,
    },
    taxExemptionBasket: { ...EMPTY_PROFILE.taxExemptionBasket, ...taxExemptionBasket },
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
        policyNumber: "",
        fundId: "",
        reportId: null,
        productCategory: null,
        legacyPolicyModel: null,
        accountStatus: null,
        lifeAnnuityFrom60: false,
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
      reports: [],
      otherAssets: otherAssets ?? null,
    },
    equity: {
      usdToIlsRate: usdToIlsRate?.rate ?? null,
      usdToIlsRateDate: usdToIlsRate?.date ?? null,
      holdings: equity.map((holding, index) => {
        const category: InvestmentCategory | null =
          holding.category ?? (holding.employerGrant ? "employerGrantedStock" : null);
        const entryDate = holding.entry?.date ?? null;
        const entryPrice = holding.entry?.priceUSD ?? null;
        const entryRate = holding.entry?.usdToIlsRate ?? null;
        // As in the app, an entry made before choosing a category sits in every category's fields.
        const entryIn = (target: InvestmentCategory) => category === target || category === null;
        return {
          id: `test-holding-${index}`,
          investmentCategory: category,
          tickerSymbol: holding.ticker ?? "TEST",
          companyName: "Test Co",
          custodianOrBroker: "",
          quantity: holding.quantity,
          currentMarketPriceUSD: holding.priceUSD,
          employerGrantDetails: {
            grantDate:
              holding.employerGrant?.grantDate ??
              (entryIn("employerGrantedStock") ? entryDate : null),
            taxTrack: holding.employerGrant?.taxTrack ?? null,
            vestedQuantity: null,
            unvestedQuantity: null,
            trusteeHoldingPeriodMet: holding.employerGrant?.holdingPeriodMet ?? false,
            costBasisAtGrantUSD:
              holding.employerGrant?.grantPriceUSD ??
              (entryIn("employerGrantedStock") ? entryPrice : null),
            usdToIlsRateAtGrant: entryIn("employerGrantedStock") ? entryRate : null,
            estimatedMarginalTaxOnVesting: null,
            vestingTranches: (holding.employerGrant?.vestingTranches ?? []).map(
              (tranche, trancheIndex) => ({
                id: `test-tranche-${index}-${trancheIndex}`,
                vestDate: tranche.vestDate ?? null,
                quantity: tranche.quantity,
                grantPriceUSD: tranche.grantPriceUSD ?? null,
              }),
            ),
            keepsVestingAfterLeaving: holding.employerGrant?.keepsVestingAfterLeaving ?? false,
            vestingSchedule: { batches: null, everyMonths: null, firstVestMonths: null },
          },
          esppDetails: {
            purchaseDate: entryIn("employerEsppDiscount") ? entryDate : null,
            discountPercentage: null,
            purchasePriceUSD: null,
            fairMarketValueAtPurchaseUSD: entryIn("employerEsppDiscount") ? entryPrice : null,
            usdToIlsRateAtPurchase: entryIn("employerEsppDiscount") ? entryRate : null,
            taxedDiscountValueUSD: null,
            capitalGainsOnGrowthUSD: null,
          },
          personalPurchaseDetails: {
            purchaseDate: entryIn("personalBrokeragePurchase") ? entryDate : null,
            averageCostBasisUSD: entryIn("personalBrokeragePurchase") ? entryPrice : null,
            usdToIlsRateAtPurchase: entryIn("personalBrokeragePurchase") ? entryRate : null,
            unrealizedCapitalGainUSD: holding.unrealizedCapitalGainUSD ?? null,
            capitalGainsTaxRatePercent: holding.capitalGainsTaxRatePercent ?? null,
          },
          purchaseLots: (holding.purchaseLots ?? []).map((lot, lotIndex) => ({
            id: `test-lot-${index}-${lotIndex}`,
            purchaseDate: lot.date ?? null,
            quantity: lot.quantity,
            priceUSD: lot.priceUSD,
            usdToIlsRate: lot.usdToIlsRate ?? null,
          })),
        };
      }),
    },
    expenses: {
      mode: expenseItems ? "detailed" : "totals",
      retirementMonthly: retirementMonthlyExpenses ?? null,
      items: (expenseItems ?? []).map((item) => ({ ...createEmptyExpenseItem(), ...item })),
    },
    assumptions: {
      preset: "base",
      investmentReturnPct: investmentReturnPct ?? EMPTY_PROFILE.assumptions.investmentReturnPct,
      inflationPct: inflationPct ?? EMPTY_PROFILE.assumptions.inflationPct,
      volatilityPct: volatilityPct ?? EMPTY_PROFILE.assumptions.volatilityPct,
      withdrawalStrategy: withdrawalStrategy ?? EMPTY_PROFILE.assumptions.withdrawalStrategy,
    },
    comparisonAges: comparisonAges ?? null,
    bankDeposits: bankDeposits.map(
      (deposit, index): BankDeposit => ({
        id: `test-deposit-${index}`,
        bankName: deposit.bankName ?? "Test Bank",
        amount: deposit.amount,
        startDate: deposit.startDate ?? null,
        maturityDate: deposit.maturityDate ?? null,
        rateType: deposit.rateType ?? "fixed",
        annualInterestRatePercent: deposit.annualInterestRatePercent ?? null,
        cpiLinked: deposit.cpiLinked ?? false,
        autoRenew: deposit.autoRenew ?? false,
      }),
    ),
  };
}
