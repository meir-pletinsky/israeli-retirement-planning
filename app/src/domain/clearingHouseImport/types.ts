import type {
  AccountStatus,
  Gender,
  LegacyPolicyModel,
  MaritalStatus,
  ProductCategory,
} from "../../types";

/**
 * How far an imported value can be trusted:
 * - official: read straight from a coded element of the report;
 * - derived: computed from report values (a rate from an amount and a salary);
 * - uncertain: an interpretation the user should confirm, so it starts unticked.
 */
export type ImportConfidence = "official" | "derived" | "uncertain";

export interface ImportedValue<T> {
  value: T;
  confidence: ImportConfidence;
  /** The element the value came from. Names only: never a value or a file name. */
  source: string;
}

export interface ImportedFieldValues {
  providerName: string;
  policyNumber: string;
  productCategory: ProductCategory;
  legacyPolicyModel: LegacyPolicyModel;
  accountStatus: AccountStatus;
  joinDate: string;
  liquidityDate: string;
  totalAccumulatedBalance: number;
  monthlySalaryBase: number;
  employeeRatePercent: number;
  employerRatePercent: number;
  severanceRatePercent: number;
  severanceBalance: number;
  deathCoverageAmount: number;
  monthlyDisabilityAmount: number;
  monthlyRiskDeduction: number;
  investmentTrackName: string;
  feeFromAccumulationPercent: number;
  feeFromDepositPercent: number;
  hasGuaranteedFactor: boolean;
  conversionFactor: number;
  estimatedMonthlyAnnuity: number;
}

export type AccountFieldKey = keyof ImportedFieldValues;

export const ACCOUNT_FIELD_KEYS: readonly AccountFieldKey[] = [
  "providerName",
  "policyNumber",
  "productCategory",
  "accountStatus",
  "legacyPolicyModel",
  "joinDate",
  "liquidityDate",
  "totalAccumulatedBalance",
  "monthlySalaryBase",
  "employeeRatePercent",
  "employerRatePercent",
  "severanceRatePercent",
  "severanceBalance",
  "deathCoverageAmount",
  "monthlyDisabilityAmount",
  "monthlyRiskDeduction",
  "investmentTrackName",
  "feeFromAccumulationPercent",
  "feeFromDepositPercent",
  "hasGuaranteedFactor",
  "conversionFactor",
  "estimatedMonthlyAnnuity",
];

export type ImportedFields = { [K in AccountFieldKey]?: ImportedValue<ImportedFieldValues[K]> };

export type ImportWarningCode =
  | "policyNumberIsHolderId"
  | "productTypeUnknown"
  | "pensionTypeUnknown"
  | "pensionTypeBasic"
  | "statusUnknown"
  | "contributionRatesDerived"
  | "contributionRatesMissingSalary"
  | "contributionTypeNotModelled"
  | "feeRowsDiffer"
  | "feesAllZero"
  | "feeAccumulationMismatch"
  | "trackFromDepositOnly"
  | "trackDiffersFromDeposit"
  | "negativeBalance"
  | "joinDateImplausible"
  | "controlCountMismatch"
  | "staleReport"
  | "newerSchemaVersion"
  | "personalConflict";

export interface ImportWarning {
  code: ImportWarningCode;
  /** Plain values for the message (counts, codes, percents); never identifiers. */
  params?: Record<string, string | number>;
}

/** Notes that explain the data versus problems the user should look at. */
export const WARNING_SEVERITY: Record<ImportWarningCode, "info" | "warning"> = {
  policyNumberIsHolderId: "info",
  productTypeUnknown: "warning",
  pensionTypeUnknown: "warning",
  pensionTypeBasic: "warning",
  statusUnknown: "warning",
  contributionRatesDerived: "info",
  contributionRatesMissingSalary: "warning",
  contributionTypeNotModelled: "warning",
  feeRowsDiffer: "warning",
  feesAllZero: "warning",
  feeAccumulationMismatch: "warning",
  trackFromDepositOnly: "info",
  trackDiffersFromDeposit: "info",
  negativeBalance: "warning",
  joinDateImplausible: "info",
  controlCountMismatch: "warning",
  staleReport: "warning",
  newerSchemaVersion: "info",
  personalConflict: "warning",
};

export type SkipReason = "noRetirementBalance" | "closedOrCancelled" | "noBalanceData";

export interface SkippedRecord {
  reason: SkipReason;
  /** `SUG-MUTZAR`, so the page can name the product kind. */
  productTypeCode: number | null;
}

/**
 * The report's own projection at one retirement age. Shown for comparison; the annuity fields
 * are derived from it for the user's retirement age (see `annuityFieldsFor`).
 */
export interface ReportProjection {
  age: number;
  /** Accumulation at that age assuming deposits continue. */
  accumulation: number | null;
  /** Monthly pension at that age assuming deposits continue. */
  monthlyPension: number | null;
  /** The conversion factor the policy guarantees at that age, when it states one. */
  guaranteedFactor: number | null;
  /** Accumulation divided by monthly pension, when the report states both on the same basis. */
  impliedFactor: number | null;
}

/**
 * How an account's monthly annuity is best estimated from the report:
 * - pension: the provider's projected pension (old pension funds, whose pension follows the fund's rules, not a balance);
 * - factor: the accumulation divided by a conversion factor.
 * A candidate holds null when its product does not convert into an annuity.
 */
export type AnnuityBasis = "pension" | "factor";

export interface ImportedAccountCandidate {
  /** Unique within one import session. */
  key: string;
  productTypeCode: number | null;
  fields: ImportedFields;
  warnings: ImportWarning[];
  projections: ReportProjection[];
  annuityBasis: AnnuityBasis | null;
  /** For recognising the account on the review screen only: never stored or exported. */
  display: { planName: string | null; employerName: string | null };
  /** `yyyy-mm-dd` valuation date of the balance, if the report states one. */
  valuationDate: string | null;
}

export interface PersonalSuggestions {
  gender?: ImportedValue<Gender>;
  maritalStatus?: ImportedValue<MaritalStatus>;
  age?: ImportedValue<number>;
  monthlyGrossSalary?: ImportedValue<number>;
}

export interface ReportMapResult {
  schemaVersion: number | null;
  candidates: ImportedAccountCandidate[];
  skipped: SkippedRecord[];
  personal: PersonalSuggestions;
  warnings: ImportWarning[];
}

export interface MapOptions {
  now: Date;
  /** Distinguishes candidates from different files in one session. */
  fileIndex?: number;
}
