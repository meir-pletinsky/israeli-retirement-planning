/**
 * The verification pack: one self-contained JSON document that lets someone
 * outside the app re-check a result.
 *
 * `buildVerificationPack` runs the funding-gap calculation for one retirement
 * target with tracing on (that single call covers the whole chain: sources,
 * Bituach Leumi, retirement income, drawdown, tax, net income and the gap),
 * adds summary tables for the other ages, redacts everything that identifies
 * an account or a person, re-checks the trace against the redacted inputs,
 * and returns the pack together with the local-only redaction key.
 */

import type { ProfileData } from "../types";
import { MAX_RETIREMENT_SEARCH_AGE } from "./constants";
import { calculateFundingGapAtAge, calculateFundingGapForTiming } from "./fundingGap";
import {
  resolveRetirementTiming,
  retirementTimingShiftedTo,
  spouseAgeAt,
  type RetirementTiming,
} from "./household";
import { findEarliestFeasibleRetirementAge } from "./feasibility";
import { isHouseholdActive, resolveCurrentAge } from "./profileBasics";
import {
  compareRetirementAge,
  defaultComparisonAges,
  type RetirementAgeOutcome,
} from "./scenarioComparison";
import { runTraced, withEngineClock, type TraceScalar, type TraceStep, type TraceTable } from "./trace";
import { checkTrace, type TraceCheckResult } from "./traceCheck";
import { constantsSnapshot, jsonSafe } from "./traceConstants";
import type { FundingGapResult, RetirementFeasibility, RetirementScenario } from "./types";
import { AUDITOR_PROMPT, AUDIT_GUIDE } from "./verificationGuide";
import {
  buildIdAliases,
  buildRedactionKey,
  collectSensitiveTexts,
  findLeaks,
  redactLog,
  redactProfile,
  type RedactionKey,
} from "./verificationRedaction";

export const VERIFICATION_PACK_FORMAT = "retirement-planning-verification-pack";
export const VERIFICATION_PACK_VERSION = 1;

/** What to trace: a retirement scenario, or the primary user retiring at an age (a spouse moves by the same number of years). */
export type VerificationTarget =
  | { kind: "scenario"; scenario: RetirementScenario }
  | { kind: "age"; age: number };

export interface VerificationPackOptions {
  profile: ProfileData;
  target: VerificationTarget;
  /** The moment the engine treats as "now". Defaults to the current time. */
  evaluatedAt?: Date;
}

export interface GapByAgeTable {
  columns: string[];
  rows: TraceScalar[][];
}

export interface VerificationPack {
  format: typeof VERIFICATION_PACK_FORMAT;
  formatVersion: typeof VERIFICATION_PACK_VERSION;
  evaluatedAt: string;
  target: VerificationTarget;
  timing: RetirementTiming;
  privacy: { redacted: string[]; warning: string };
  audit: { guide: string[]; prompt: string };
  /** The saved inputs, redacted. */
  inputs: unknown;
  constants: Record<string, unknown>;
  trace: { steps: TraceStep[]; tables: TraceTable[] };
  displayed: {
    fundingGap: FundingGapResult;
    feasibility: RetirementFeasibility;
    ageComparison: RetirementAgeOutcome[];
    gapByAge: GapByAgeTable;
  };
  /** Steps whose formula rounds, floors or ceils: where a whole-shekel or whole-year cut happens. */
  roundingSteps: string[];
  selfCheck: TraceCheckResult;
}

export interface BuiltVerificationPack {
  pack: VerificationPack;
  /** Maps the aliases in the pack back to real accounts. Local only. */
  redactionKey: RedactionKey;
}

/** The redaction missed something; nothing is exported. The message never repeats the leaked text. */
export class VerificationPackLeakError extends Error {
  readonly locations: string[];

  constructor(locations: string[]) {
    super(`The verification pack still contains text from your inputs in ${locations.length} place(s). Nothing was exported.`);
    this.name = "VerificationPackLeakError";
    this.locations = locations;
  }
}

const PRIVACY_REDACTED = [
  "Account, holding and vesting ids are replaced by aliases (acct1, holding1, tranche1).",
  "Provider names, policy numbers, fund ids, investment-track names, tickers, company names, brokers and any other free text are replaced by [redacted].",
  "Enums (product type, status, tax track, gender, marital status) and dates are kept, as are all numbers.",
];

const PRIVACY_WARNING =
  "Redacted does not mean anonymous: the pack still holds your balances, salary, deposit rates, ages and dates. Share it only with a reviewer or an AI service you trust with that. The redaction key is a separate file; never share it.";

function resolveTiming(profile: ProfileData, target: VerificationTarget): RetirementTiming {
  return target.kind === "scenario"
    ? resolveRetirementTiming(profile, target.scenario)
    : retirementTimingShiftedTo(profile, target.age);
}

function gapByAge(profile: ProfileData): GapByAgeTable {
  const startAge = Math.ceil(resolveCurrentAge(profile));
  const endAge = Math.max(MAX_RETIREMENT_SEARCH_AGE, startAge);
  const couple = isHouseholdActive(profile);
  const rows: TraceScalar[][] = [];
  for (let age = startAge; age <= endAge; age += 1) {
    const gap = calculateFundingGapAtAge(profile, age);
    rows.push([
      age,
      couple ? spouseAgeAt(profile, age) : null,
      gap.grossMonthlyIncome,
      gap.estimatedMonthlyTax,
      gap.estimatedMonthlyIncome,
      gap.desiredMonthlyExpenses,
      gap.monthlyGap,
      gap.status,
    ]);
  }
  return {
    columns: [
      "primaryAge",
      "spouseAge",
      "grossMonthly",
      "taxMonthly",
      "netMonthly",
      "desiredMonthly",
      "monthlyGap",
      "status",
    ],
    rows,
  };
}

function ageComparison(profile: ProfileData, target: VerificationTarget): RetirementAgeOutcome[] {
  const ages = new Set<number>(defaultComparisonAges(profile));
  if (target.kind === "age") ages.add(target.age);
  return [...ages].sort((a, b) => a - b).map((age) => compareRetirementAge(profile, age));
}

export function buildVerificationPack(options: VerificationPackOptions): BuiltVerificationPack {
  const { profile, target } = options;
  const evaluatedAt = options.evaluatedAt ?? new Date();
  const timing = resolveTiming(profile, target);

  const traced = runTraced(() => calculateFundingGapForTiming(profile, timing), { evaluatedAt });
  const displayed = withEngineClock(evaluatedAt, () => ({
    fundingGap: traced.result,
    feasibility: findEarliestFeasibleRetirementAge(profile),
    ageComparison: ageComparison(profile, target),
    gapByAge: gapByAge(profile),
  }));

  const aliases = buildIdAliases(profile);
  const inputs = redactProfile(profile, aliases);
  const log = redactLog(traced.log, aliases);
  const constants = constantsSnapshot();
  const selfCheck = checkTrace(log, { profile: inputs, constants });

  const pack: VerificationPack = {
    format: VERIFICATION_PACK_FORMAT,
    formatVersion: VERIFICATION_PACK_VERSION,
    evaluatedAt: log.evaluatedAt,
    target,
    timing,
    privacy: { redacted: PRIVACY_REDACTED, warning: PRIVACY_WARNING },
    audit: { guide: AUDIT_GUIDE, prompt: AUDITOR_PROMPT },
    inputs,
    constants,
    trace: { steps: log.steps, tables: log.tables },
    displayed: jsonSafe(displayed) as VerificationPack["displayed"],
    roundingSteps: log.steps
      .filter((step) => step.expr !== undefined && /\b(round|floor|ceil)\(/.test(step.expr))
      .map((step) => step.id),
    selfCheck,
  };

  const leaks = findLeaks(pack, collectSensitiveTexts(profile));
  if (leaks.length > 0) throw new VerificationPackLeakError(leaks);

  return { pack, redactionKey: buildRedactionKey(profile, aliases, log.evaluatedAt) };
}

/**
 * The pack as readable JSON. Table rows and column lists stay on one line each,
 * so a year-by-year table is a screenful, not thousands of lines.
 */
export function serializeVerificationPack(pack: VerificationPack): string {
  const lines: string[] = [];
  const compact = (value: unknown): string => {
    lines.push(JSON.stringify(value));
    return `\u0000${lines.length - 1}\u0000`;
  };
  const prepared = {
    ...pack,
    trace: {
      ...pack.trace,
      tables: pack.trace.tables.map((table) => ({
        ...table,
        columns: compact(table.columns),
        rows: table.rows.map(compact),
      })),
    },
    displayed: {
      ...pack.displayed,
      gapByAge: {
        columns: compact(pack.displayed.gapByAge.columns),
        rows: pack.displayed.gapByAge.rows.map(compact),
      },
    },
  };
  return JSON.stringify(prepared, null, 1).replace(/"\\u0000(\d+)\\u0000"/g, (_match, index: string) => lines[Number(index)]);
}
