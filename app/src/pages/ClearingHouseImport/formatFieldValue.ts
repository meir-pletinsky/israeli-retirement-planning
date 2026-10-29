import type { TFunction } from "i18next";

import type { AccountFieldKey, PersonalFieldKey } from "../../domain/clearingHouseImport";

const MONEY_KEYS: ReadonlySet<AccountFieldKey> = new Set([
  "totalAccumulatedBalance",
  "severanceBalance",
  "deathCoverageAmount",
  "monthlyDisabilityAmount",
  "monthlyRiskDeduction",
]);

const PERCENT_KEYS: ReadonlySet<AccountFieldKey> = new Set([
  "employeeRatePercent",
  "employerRatePercent",
  "severanceRatePercent",
  "feeFromAccumulationPercent",
  "feeFromDepositPercent",
]);

const OPTION_KEYS: ReadonlySet<AccountFieldKey> = new Set([
  "productCategory",
  "accountStatus",
  "legacyPolicyModel",
]);

const EMPTY = "\u2014";

export function formatMoney(value: number, currency: string): string {
  return `${currency}${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function formatAccountValue(
  key: AccountFieldKey,
  value: string | number | null | undefined,
  t: TFunction,
  currency: string,
): string {
  if (value === null || value === undefined || value === "") return EMPTY;
  if (OPTION_KEYS.has(key)) return t(`myData.steps.pensionSavings.options.${key}.${value}`);
  if (typeof value === "number") {
    if (MONEY_KEYS.has(key)) return formatMoney(value, currency);
    const formatted = value.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return PERCENT_KEYS.has(key) ? `${formatted}%` : formatted;
  }
  return value;
}

/** `SUG-MUTZAR` 1–10; any other code reads as an unknown product. */
export function productKindLabel(code: number | null, t: TFunction): string {
  const known = code !== null && Number.isInteger(code) && code >= 1 && code <= 10;
  return t(`clearingHouse.review.productKind.${known ? code : "unknown"}`);
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatPersonalValue(
  key: PersonalFieldKey,
  value: string | number | null | undefined,
  t: TFunction,
  currency: string,
): string {
  if (value === null || value === undefined || value === "") return EMPTY;
  if (key === "gender" || key === "maritalStatus") {
    return t(`myData.steps.personal.${key}${capitalise(String(value))}`);
  }
  if (typeof value === "number" && key === "monthlyGrossSalary") return formatMoney(value, currency);
  return String(value);
}
