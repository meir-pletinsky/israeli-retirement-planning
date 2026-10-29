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

/** The report's own projection at one retirement age. Display only, never imported. */
export interface ReportProjection {
  age: number;
  /** Accumulation at that age assuming deposits continue. */
  accumulation: number | null;
  /** Monthly pension at that age assuming deposits continue. */
  monthlyPension: number | null;
}

export interface ImportedAccountCandidate {
  /** Unique within one import session. */
  key: string;
  productTypeCode: number | null;
  fields: ImportedFields;
  warnings: ImportWarning[];
  projections: ReportProjection[];
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
