/**
 * The constants the engine reads, as plain data, for the verification pack.
 * An auditor can check each against its own source, and the self-check
 * compares every `const:` input of a trace with this snapshot.
 */

import { ACCESS_RULES } from "./accessRules";
import { BITUACH_LEUMI_RATES, womenRetirementAge } from "./bituachLeumiRates";
import {
  DEFAULT_CURRENT_AGE,
  DEFAULT_RETIREMENT_AGE,
  DELAYED_RETIREMENT_OFFSET_YEARS,
  EARLY_RETIREMENT_OFFSET_YEARS,
  FALLBACK_USD_TO_ILS_RATE,
  MAX_PLANNING_AGE,
  MAX_RETIREMENT_SEARCH_AGE,
  MIN_RETIREMENT_AGE,
} from "./constants";
import { TAX_RATES } from "./taxRates";

/** JSON cannot hold Infinity (it becomes null), so write it the way a trace does. */
export function jsonSafe(value: unknown): unknown {
  if (typeof value === "number" && !Number.isFinite(value)) {
    return Number.isNaN(value) ? "NaN" : value > 0 ? "Infinity" : "-Infinity";
  }
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, jsonSafe(entry)]));
  }
  return value;
}

const FIRST_WOMEN_TABLE_YEAR = 1930;
const LAST_WOMEN_TABLE_YEAR = 2030;

export function constantsSnapshot(): Record<string, unknown> {
  const womenRetirementAgeByBirthYear: Record<string, number> = {};
  for (let year = FIRST_WOMEN_TABLE_YEAR; year <= LAST_WOMEN_TABLE_YEAR; year += 1) {
    womenRetirementAgeByBirthYear[String(year)] = womenRetirementAge(year);
  }
  return jsonSafe({
    DEFAULT_RETIREMENT_AGE,
    DEFAULT_CURRENT_AGE,
    EARLY_RETIREMENT_OFFSET_YEARS,
    DELAYED_RETIREMENT_OFFSET_YEARS,
    MIN_RETIREMENT_AGE,
    MAX_RETIREMENT_SEARCH_AGE,
    MAX_PLANNING_AGE,
    FALLBACK_USD_TO_ILS_RATE,
    TAX_RATES,
    BITUACH_LEUMI_RATES,
    ACCESS_RULES,
    WOMEN_RETIREMENT_AGE_BY_BIRTH_YEAR: womenRetirementAgeByBirthYear,
  }) as Record<string, unknown>;
}
