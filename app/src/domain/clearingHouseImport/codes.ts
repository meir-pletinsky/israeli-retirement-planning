import type { AccountStatus, Gender, LegacyPolicyModel, MaritalStatus, ProductCategory } from "../../types";
import type { ImportConfidence, ImportWarning } from "./types";

/** Product types (`SUG-MUTZAR`) that carry no retirement balance. */
const NO_BALANCE_PRODUCT_TYPES = new Set([6, 7, 8, 10]);

export function isNoBalanceProduct(productType: number | null): boolean {
  return productType !== null && NO_BALANCE_PRODUCT_TYPES.has(productType);
}

export interface CategoryResolution {
  category: ProductCategory | null;
  confidence: ImportConfidence;
  warning?: ImportWarning;
}

/**
 * `SUG-MUTZAR` (+ `SUG-KEREN-PENSIA` for pension funds) to the app's product category.
 * `isOldPension` is `PENSIA-VATIKA-O-HADASHA`: an old fund reports kind 1, which is a known case, so it is
 * suggested as "derived" (pre-selected on the review screen) with an explanatory note.
 */
export function resolveProductCategory(
  productType: number | null,
  pensionKind: number | null,
  isOldPension = false,
): CategoryResolution {
  switch (productType) {
    case 1:
    case 5:
      return { category: "managersInsurance", confidence: "official" };
    case 3:
      return { category: "providentFund", confidence: "official" };
    case 4:
      return { category: "studyFund", confidence: "official" };
    case 9:
      return { category: "investmentProvidentFund", confidence: "official" };
    case 2:
      if (pensionKind === 2) return { category: "comprehensivePension", confidence: "official" };
      if (pensionKind === 3) return { category: "generalPension", confidence: "official" };
      if (pensionKind === 1) {
        if (isOldPension) {
          return { category: "generalPension", confidence: "derived", warning: { code: "oldPensionFund" } };
        }
        return { category: "generalPension", confidence: "uncertain", warning: { code: "pensionTypeBasic" } };
      }
      return { category: null, confidence: "uncertain", warning: { code: "pensionTypeUnknown" } };
    default:
      return { category: null, confidence: "uncertain", warning: { code: "productTypeUnknown" } };
  }
}

export type StatusResolution =
  | { kind: "status"; value: AccountStatus }
  | { kind: "skip" }
  | { kind: "unknown" };

/** `STATUS-POLISA-O-CHESHBON`. `payingAnnuity` is never inferred: no sample exists. */
export function resolveStatus(code: number | null): StatusResolution {
  switch (code) {
    case 1:
      return { kind: "status", value: "activeContributing" };
    case 2:
    case 6:
    case 7:
      return { kind: "status", value: "paidUpFrozen" };
    case 3:
    case 4:
    case 10:
      return { kind: "skip" };
    default:
      return { kind: "unknown" };
  }
}

/** `SUG-POLISA` for insurance products; old pension funds carry no equivalent. */
export function resolveLegacyPolicyModel(
  productType: number | null,
  policyType: number | null,
  isOldPension: boolean,
): LegacyPolicyModel | null {
  if (isOldPension) return null;
  if (productType !== 1 && productType !== 5) return null;
  if (policyType === 2) return "adif";
  return policyType === null ? null : "none";
}

export function resolveGender(code: number | null): Gender | null {
  if (code === 1) return "male";
  if (code === 2) return "female";
  return null;
}

export function resolveMaritalStatus(code: number | null): MaritalStatus | null {
  switch (code) {
    case 1:
      return "single";
    case 2:
      return "married";
    case 3:
      return "divorced";
    case 4:
      return "widowed";
    default:
      return null;
  }
}

/** Deposit types (`SUG-HAFRASHA`) grouped by who pays and what they fund. */
export const EMPLOYEE_DEPOSIT_TYPES = [2, 8];
export const EMPLOYER_DEPOSIT_TYPES = [3, 9];
export const SEVERANCE_DEPOSIT_TYPE = 1;
/** Types known to be informational (section 47, loss-of-work-capacity premium). */
export const INFORMATIONAL_DEPOSIT_TYPES = [4, 5];
/** Depositors (`SUG-HAMAFKID`) whose rows are not ongoing salary-linked deposits. */
export const NON_ONGOING_DEPOSITORS = [4, 5, 6];

/** `SUG-KISUY-BITOCHI` blocks that feed the death and disability amounts. */
export const DEATH_COVER_TYPES = [1, 3];
export const DISABILITY_COVER_TYPES = [2, 4, 5];

export const FEE_FROM_ACCUMULATION = 1;
export const FEE_FROM_DEPOSIT = 2;
export const TRACK_FOR_ACCUMULATION = 1;
export const TRACK_FOR_DEPOSITS = 2;

export const SUPPORTED_SCHEMA_VERSION = 9;
