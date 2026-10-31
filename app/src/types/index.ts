export type Gender = "male" | "female";

export type MaritalStatus = "single" | "married" | "divorced" | "widowed";

export type AssumptionPreset = "conservative" | "base" | "optimistic";

export interface Assumptions {
  preset: AssumptionPreset;
  investmentReturnPct: number;
  inflationPct: number;
  /** Standard deviation of the yearly investment return; drives the Monte Carlo spread. */
  volatilityPct: number;
}

/** A typical mix of Israeli pension funds and global shares. */
export const DEFAULT_VOLATILITY_PCT = 12;

/** The highest volatility the Monte Carlo accepts; beyond this, yearly returns stop being credible. */
export const MAX_VOLATILITY_PCT = 50;

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
  /** Total personal tax credit points (Nekudot Zikui); null = the default for the user's gender. */
  creditPoints: number | null;
  /** Gross monthly salary in today's money; basis for ongoing pension/savings contributions. */
  monthlyGrossSalary: number | null;
}

/**
 * Tax exemption tracking under Kibua Zchuyot (Form 161D). Optional — most
 * users won't know these yet. They shape the primary user's retirement tax;
 * the spouse uses the statutory exemption.
 */
export interface TaxExemptionBasket {
  form161DSubmitted: boolean;
  pastTaxFreeSeveranceWithdrawn: number | null;
  remainingMonthlyExemptionCap: number | null;
}

export function createId(): string {
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

/** The conversion factors the annuity form accepts. */
export const CONVERSION_FACTOR_MIN = 100;
export const CONVERSION_FACTOR_MAX = 300;

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
  /**
   * The monthly gross salary these rates apply to. Empty: the owner's monthly gross salary
   * from the Personal step is used. Set it when accounts are funded from different salaries
   * (two employers, or a study fund covering the combined salary).
   */
  monthlySalaryBase: number | null;
  employeeRatePercent: number | null;
  employerRatePercent: number | null;
  severanceRatePercent: number | null;
}

export const EMPTY_ACCOUNT_CONTRIBUTIONS: AccountContributions = {
  monthlySalaryBase: null,
  employeeRatePercent: null,
  employerRatePercent: null,
  severanceRatePercent: null,
};

/** Whose account it is. Only meaningful for couples; everything else belongs to the primary user. */
export type AccountOwner = "self" | "spouse";

export interface PensionAccount {
  id: string;
  /** Defaults to "self"; "spouse" accounts count only while the plan covers a spouse. */
  owner: AccountOwner;
  providerName: string;
  /** Policy or account number as printed on the statement. Reference only: not used in any calculation. */
  policyNumber: string;
  /** Fund / program identifier ("mispar kupa"), for matching the account to published fund data later. Reference only. */
  fundId: string;
  /** The imported report that last wrote to this account (see `PensionSavingsData.reports`); null = entered by hand. */
  reportId: string | null;
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
    owner: "self",
    providerName: "",
    policyNumber: "",
    fundId: "",
    reportId: null,
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

/**
 * A Clearing House report that was imported. It lets the app say where an account came from and
 * recognise the same person's next report. The holder's ID, family name and birth date are never
 * kept: only a first name, an age and one-way fingerprints of the identifying details.
 */
export interface ImportedReport {
  id: string;
  /** Whose accounts the report was saved under. */
  owner: AccountOwner;
  /** One-way fingerprints of the person the report is about (see `reportPeople.ts`). May be empty. */
  personKeys: string[];
  /** The customer's first name as the report spells it; only for telling reports apart. */
  firstName: string | null;
  /** The person's age on the day of the import. */
  ageAtImport: number | null;
  /** `yyyy-mm-dd`: the newest balance date in the report. */
  reportDate: string | null;
  /** `yyyy-mm-dd`: the day it was imported. */
  importedAt: string;
  /** The bundled demonstration report. */
  sample: boolean;
}

export interface PensionSavingsData {
  accounts: PensionAccount[];
  /** The reports the accounts were imported from, oldest first. Accounts typed by hand are not listed here. */
  reports: ImportedReport[];
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

/**
 * A batch of an employer grant's shares that was (or will be) acquired on its
 * own date, so it has its own 24-month holding period and, optionally, its
 * own price at grant. Awards that vest in instalments are entered this way.
 */
export interface VestingTranche {
  id: string;
  /** Date the batch vests, i.e. the shares are acquired; the 24-month holding period counts from here. */
  vestDate: string | null;
  quantity: number | null;
  /** Share price at the grant date; null = the holding's own price at grant. */
  grantPriceUSD: number | null;
}

export function createEmptyVestingTranche(): VestingTranche {
  return { id: createId(), vestDate: null, quantity: null, grantPriceUSD: null };
}

export interface EmployerGrantDetails {
  /** Acquisition date of the shares not listed as a vesting tranche. */
  grantDate: string | null;
  taxTrack: TaxTrack | null;
  /** Not used by the engine; superseded by `vestingTranches`. */
  vestedQuantity: number | null;
  /** Not used by the engine; superseded by `vestingTranches`. */
  unvestedQuantity: number | null;
  /** True once the mandatory 24-month Section 102 trustee lockup period has passed. */
  trusteeHoldingPeriodMet: boolean;
  /** Share price at the grant date, for the shares not listed as a vesting tranche. */
  costBasisAtGrantUSD: number | null;
  /** Shekels per US dollar on the grant date; recorded for reference, not used in the calculations yet. */
  usdToIlsRateAtGrant: number | null;
  estimatedMarginalTaxOnVesting: number | null;
  /**
   * Batches of the holding's shares acquired on other dates. They are part of
   * `StockHolding.quantity`; whatever is not covered by a batch follows
   * `grantDate` and `trusteeHoldingPeriodMet`.
   */
  vestingTranches: VestingTranche[];
}

export const EMPTY_EMPLOYER_GRANT_DETAILS: EmployerGrantDetails = {
  grantDate: null,
  taxTrack: null,
  vestedQuantity: null,
  unvestedQuantity: null,
  trusteeHoldingPeriodMet: false,
  costBasisAtGrantUSD: null,
  usdToIlsRateAtGrant: null,
  estimatedMarginalTaxOnVesting: null,
  vestingTranches: [],
};

export interface EsppDetails {
  purchaseDate: string | null;
  discountPercentage: number | null;
  purchasePriceUSD: number | null;
  fairMarketValueAtPurchaseUSD: number | null;
  /** Shekels per US dollar on the purchase date; recorded for reference, not used in the calculations yet. */
  usdToIlsRateAtPurchase: number | null;
  taxedDiscountValueUSD: number | null;
  capitalGainsOnGrowthUSD: number | null;
}

export interface PersonalPurchaseDetails {
  purchaseDate: string | null;
  averageCostBasisUSD: number | null;
  /** Shekels per US dollar on the purchase date; recorded for reference, not used in the calculations yet. */
  usdToIlsRateAtPurchase: number | null;
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
    employerGrantDetails: { ...EMPTY_EMPLOYER_GRANT_DETAILS, vestingTranches: [] },
    esppDetails: {
      purchaseDate: null,
      discountPercentage: null,
      purchasePriceUSD: null,
      fairMarketValueAtPurchaseUSD: null,
      usdToIlsRateAtPurchase: null,
      taxedDiscountValueUSD: null,
      capitalGainsOnGrowthUSD: null,
    },
    personalPurchaseDetails: {
      purchaseDate: null,
      averageCostBasisUSD: null,
      usdToIlsRateAtPurchase: null,
      unrealizedCapitalGainUSD: null,
      capitalGainsTaxRatePercent: 25,
    },
  };
}

export interface EquityData {
  holdings: StockHolding[];
  /**
   * Shekels per US dollar used to value the holdings; null = the built-in fallback rate.
   * With a `usdToIlsRateDate` it is the Bank of Israel rate of that day, kept up to date by the
   * app. Without one the user typed it, and it is never replaced by a lookup.
   */
  usdToIlsRate: number | null;
  usdToIlsRateDate: string | null;
}

/** Where a household expense belongs, for grouping the itemised list. */
export const EXPENSE_CATEGORIES = [
  "housing",
  "food",
  "transport",
  "health",
  "communication",
  "lifestyle",
  "travel",
  "family",
  "financial",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** How often an expense is paid. `everyYears` uses the item's `everyYears` count. */
export const EXPENSE_FREQUENCIES = ["monthly", "bimonthly", "quarterly", "yearly", "everyYears"] as const;
export type ExpenseFrequency = (typeof EXPENSE_FREQUENCIES)[number];

/** Essential items make the minimum budget; discretionary ones are added on top for the desired budget. */
export type ExpenseNecessity = "essential" | "discretionary";

/** One line of the itemised retirement budget. */
export interface ExpenseItem {
  id: string;
  /** Key of the built-in suggestion this item came from; null for items the user made up. */
  catalogKey: string | null;
  name: string;
  category: ExpenseCategory;
  /** What one payment is expected to cost in retirement, in today's money. */
  amount: number | null;
  frequency: ExpenseFrequency;
  /** Years between payments; used only when `frequency` is `everyYears`. */
  everyYears: number | null;
  necessity: ExpenseNecessity;
  notes: string;
}

export function createEmptyExpenseItem(): ExpenseItem {
  return {
    id: createId(),
    catalogKey: null,
    name: "",
    category: "other",
    amount: null,
    frequency: "monthly",
    everyYears: null,
    necessity: "essential",
    notes: "",
  };
}

/**
 * `totals`: the user types one monthly figure. `detailed`: the figure is the sum of `items`, each
 * converted to a monthly amount. The figure typed for `totals` is kept when the user switches.
 */
export type ExpensesMode = "totals" | "detailed";

export interface ExpensesData {
  mode: ExpensesMode;
  /** The typed monthly spending in retirement, in today's money. Used only in `totals` mode. */
  retirementMonthly: number | null;
  items: ExpenseItem[];
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

/**
 * The spouse's own basics. The spouse joins the plan once `maritalStatus` is
 * "married" and `age` is entered; their accounts are the ones owned by
 * "spouse". Expenses, assumptions, other assets and equity stay household-level.
 */
export interface SpouseData {
  age: number | null;
  gender: Gender | null;
  retirementAge: number | null;
  /** Gross monthly salary in today's money; basis for the spouse's own account contributions. */
  monthlyGrossSalary: number | null;
  /** The spouse's own tax credit points; null = the default for their gender. */
  creditPoints: number | null;
  bituachLeumi: BituachLeumiData;
}

export const EMPTY_SPOUSE: SpouseData = {
  age: null,
  gender: null,
  retirementAge: null,
  monthlyGrossSalary: null,
  creditPoints: null,
  bituachLeumi: { ...EMPTY_BITUACH_LEUMI },
};

export interface ProfileData {
  personal: PersonalData;
  spouse: SpouseData;
  taxExemptionBasket: TaxExemptionBasket;
  bituachLeumi: BituachLeumiData;
  pensionSavings: PensionSavingsData;
  equity: EquityData;
  expenses: ExpensesData;
  assumptions: Assumptions;
  /** The three retirement ages last compared on Projections; null until the user changes them. */
  comparisonAges: [number, number, number] | null;
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
  spouse: { ...EMPTY_SPOUSE },
  taxExemptionBasket: {
    form161DSubmitted: false,
    pastTaxFreeSeveranceWithdrawn: null,
    remainingMonthlyExemptionCap: null,
  },
  bituachLeumi: { ...EMPTY_BITUACH_LEUMI },
  pensionSavings: { accounts: [], reports: [], otherAssets: null },
  equity: { holdings: [], usdToIlsRate: null, usdToIlsRateDate: null },
  expenses: { mode: "totals", retirementMonthly: null, items: [] },
  assumptions: { preset: "base", ...ASSUMPTION_PRESETS.base, volatilityPct: DEFAULT_VOLATILITY_PCT },
  comparisonAges: null,
};

/** An exchange rate is a positive number; anything else (missing, zero, text from a hand-edited file) is no rate. */
function validRate(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/** Keeps the well-formed report records of a possibly hand-edited or older profile and drops the rest. */
function normalizeReports(value: unknown): ImportedReport[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): ImportedReport[] => {
    if (typeof entry !== "object" || entry === null) return [];
    const report = entry as Partial<ImportedReport>;
    if (typeof report.id !== "string" || report.id === "") return [];
    return [
      {
        id: report.id,
        owner: report.owner === "spouse" ? "spouse" : "self",
        personKeys: Array.isArray(report.personKeys)
          ? report.personKeys.filter((key): key is string => typeof key === "string" && key !== "")
          : [],
        firstName: typeof report.firstName === "string" && report.firstName !== "" ? report.firstName : null,
        ageAtImport:
          typeof report.ageAtImport === "number" && Number.isFinite(report.ageAtImport) ? report.ageAtImport : null,
        reportDate: typeof report.reportDate === "string" ? report.reportDate : null,
        importedAt: typeof report.importedAt === "string" ? report.importedAt : "",
        sample: report.sample === true,
      },
    ];
  });
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function oneOf<T extends string>(options: readonly T[], value: unknown, fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

/**
 * Reads the expenses of a possibly hand-edited or older profile. Anything unknown is dropped, which
 * also discards the "current monthly" figure that older profiles saved and nothing reads.
 */
function normalizeExpenses(value: unknown): ExpensesData {
  const saved = typeof value === "object" && value !== null ? (value as Partial<ExpensesData>) : {};
  const items = Array.isArray(saved.items) ? saved.items : [];
  return {
    mode: saved.mode === "detailed" ? "detailed" : "totals",
    retirementMonthly: finiteOrNull(saved.retirementMonthly),
    items: items.flatMap((entry): ExpenseItem[] => {
      if (typeof entry !== "object" || entry === null) return [];
      const item = entry as Partial<ExpenseItem>;
      if (typeof item.id !== "string" || item.id === "") return [];
      const everyYears = finiteOrNull(item.everyYears);
      return [
        {
          id: item.id,
          catalogKey: typeof item.catalogKey === "string" && item.catalogKey !== "" ? item.catalogKey : null,
          name: typeof item.name === "string" ? item.name : "",
          category: oneOf(EXPENSE_CATEGORIES, item.category, "other"),
          amount: finiteOrNull(item.amount),
          frequency: oneOf(EXPENSE_FREQUENCIES, item.frequency, "monthly"),
          everyYears: everyYears !== null && everyYears > 0 ? everyYears : null,
          necessity: item.necessity === "discretionary" ? "discretionary" : "essential",
          notes: typeof item.notes === "string" ? item.notes : "",
        },
      ];
    }),
  };
}

/** Older profiles have no volatility, and a hand-edited one may hold text; both get the default. */
function normalizeAssumptions(value: Partial<Assumptions> | undefined): Assumptions {
  const merged = { ...EMPTY_PROFILE.assumptions, ...value };
  return { ...merged, volatilityPct: finiteOrNull(merged.volatilityPct) ?? DEFAULT_VOLATILITY_PCT };
}

function isComparisonAges(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((age) => typeof age === "number" && Number.isFinite(age))
  );
}

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
    spouse: {
      ...EMPTY_SPOUSE,
      ...parsed?.spouse,
      bituachLeumi: { ...EMPTY_BITUACH_LEUMI, ...parsed?.spouse?.bituachLeumi },
    },
    taxExemptionBasket: {
      ...EMPTY_PROFILE.taxExemptionBasket,
      ...parsed?.taxExemptionBasket,
    },
    bituachLeumi: { ...EMPTY_PROFILE.bituachLeumi, ...parsed?.bituachLeumi },
    expenses: normalizeExpenses(parsed?.expenses),
    assumptions: normalizeAssumptions(parsed?.assumptions),
    comparisonAges: isComparisonAges(parsed?.comparisonAges) ? parsed.comparisonAges : null,
  };
  // Guard against the pre-schema-expansion shape (plain numeric fields
  // instead of an accounts/holdings array).
  if (!Array.isArray(merged.pensionSavings?.accounts)) {
    merged.pensionSavings = EMPTY_PROFILE.pensionSavings;
  } else {
    // Accounts saved before contribution rates existed lack `contributions`,
    // ones saved before couples were supported lack `owner`, and older ones
    // lack the reference IDs.
    merged.pensionSavings = {
      ...merged.pensionSavings,
      accounts: merged.pensionSavings.accounts.map((account) => ({
        ...account,
        owner: account.owner === "spouse" ? "spouse" : "self",
        policyNumber: account.policyNumber ?? "",
        fundId: account.fundId ?? "",
        reportId: typeof account.reportId === "string" ? account.reportId : null,
        contributions: {
          ...EMPTY_ACCOUNT_CONTRIBUTIONS,
          ...account.contributions,
        },
      })),
      reports: normalizeReports(merged.pensionSavings.reports),
    };
  }
  if (!Array.isArray(merged.equity?.holdings)) {
    merged.equity = EMPTY_PROFILE.equity;
  } else {
    // Holdings saved before vesting tranches or exchange rates existed lack those fields.
    merged.equity = {
      holdings: merged.equity.holdings.map((holding) => ({
        ...holding,
        employerGrantDetails: {
          ...EMPTY_EMPLOYER_GRANT_DETAILS,
          ...holding.employerGrantDetails,
          usdToIlsRateAtGrant: validRate(holding.employerGrantDetails?.usdToIlsRateAtGrant),
          vestingTranches: Array.isArray(holding.employerGrantDetails?.vestingTranches)
            ? holding.employerGrantDetails.vestingTranches.map((tranche) => ({
                ...createEmptyVestingTranche(),
                ...tranche,
              }))
            : [],
        },
        esppDetails: {
          ...holding.esppDetails,
          usdToIlsRateAtPurchase: validRate(holding.esppDetails?.usdToIlsRateAtPurchase),
        },
        personalPurchaseDetails: {
          ...holding.personalPurchaseDetails,
          usdToIlsRateAtPurchase: validRate(holding.personalPurchaseDetails?.usdToIlsRateAtPurchase),
        },
      })),
      usdToIlsRate: validRate(merged.equity.usdToIlsRate),
      usdToIlsRateDate:
        validRate(merged.equity.usdToIlsRate) !== null &&
        typeof merged.equity.usdToIlsRateDate === "string"
          ? merged.equity.usdToIlsRateDate
          : null,
    };
  }
  return merged;
}

function isSameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => isSameValue(left[key], right[key]));
}

/**
 * True once anything in the profile differs from a fresh one, whether it was typed, imported or
 * read from a clearing-house report. Comparing with `EMPTY_PROFILE` (rather than listing fields)
 * keeps this right when a field is added later.
 */
export function hasProfileData(profile: ProfileData): boolean {
  return !isSameValue(profile, EMPTY_PROFILE);
}

export type RetirementScenario = "standard" | "early" | "delayed";
