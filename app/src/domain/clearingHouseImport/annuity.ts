import { CONVERSION_FACTOR_MAX, CONVERSION_FACTOR_MIN } from "../../types";
import type {
  ImportConfidence,
  ImportedAccountCandidate,
  ImportedFields,
  ReportProjection,
} from "./types";

function hasFigure(projection: ReportProjection): boolean {
  return (projection.accumulation ?? 0) > 0 || (projection.monthlyPension ?? 0) > 0;
}

/** The report's projection closest to a target age, among those that pass `usable` (a positive figure by default). */
export function nearestProjection(
  projections: ReportProjection[],
  targetAge: number,
  usable: (projection: ReportProjection) => boolean = hasFigure,
): ReportProjection | null {
  let best: ReportProjection | null = null;
  for (const projection of projections) {
    if (!usable(projection)) continue;
    if (best === null || Math.abs(projection.age - targetAge) < Math.abs(best.age - targetAge)) {
      best = projection;
    }
  }
  return best;
}

/**
 * A figure the report states for another age than the user's retirement age, or a factor the form
 * would reject, is only a guess for the user's situation, so the user has to confirm it.
 */
function confidenceFor(certain: ImportConfidence, projection: ReportProjection, retirementAge: number): ImportConfidence {
  return Math.abs(projection.age - retirementAge) < 0.5 ? certain : "uncertain";
}

function plausibleFactor(factor: number): boolean {
  return factor >= CONVERSION_FACTOR_MIN && factor <= CONVERSION_FACTOR_MAX;
}

/**
 * The annuity fields for a candidate, taken from the report's projection nearest the retirement age.
 * - Old pension funds get the provider's projected monthly pension: it follows the fund's rules, not the balance.
 * - Policies with a guaranteed factor get that factor and the "guaranteed" flag.
 * - Other pension funds and managers insurance get the factor implied by the projection (accumulation divided
 *   by monthly pension). It is not flagged as guaranteed, so the engine uses it for pension funds only.
 */
export function annuityFieldsFor(candidate: ImportedAccountCandidate, retirementAge: number): ImportedFields {
  const fields: ImportedFields = {};
  const { projections } = candidate;

  if (candidate.annuityBasis === "pension") {
    const projection = nearestProjection(projections, retirementAge, (entry) => (entry.monthlyPension ?? 0) > 0);
    if (projection) {
      fields.estimatedMonthlyAnnuity = {
        value: projection.monthlyPension!,
        confidence: confidenceFor("official", projection, retirementAge),
        source: "SCHUM-KITZVAT-ZIKNA",
      };
    }
    return fields;
  }

  if (candidate.annuityBasis !== "factor") return fields;

  const guaranteed = nearestProjection(projections, retirementAge, (entry) => entry.guaranteedFactor !== null);
  if (guaranteed) {
    const factor = guaranteed.guaranteedFactor!;
    const confidence = plausibleFactor(factor) ? confidenceFor("official", guaranteed, retirementAge) : "uncertain";
    fields.hasGuaranteedFactor = { value: true, confidence, source: "MEKADEM-MOVTACH-LEPRISHA" };
    fields.conversionFactor = { value: factor, confidence, source: "MEKADEM-MOVTACH-LEPRISHA" };
    return fields;
  }

  const implied = nearestProjection(projections, retirementAge, (entry) => entry.impliedFactor !== null);
  if (implied) {
    const factor = implied.impliedFactor!;
    fields.conversionFactor = {
      value: factor,
      confidence: plausibleFactor(factor) ? confidenceFor("derived", implied, retirementAge) : "uncertain",
      source: "TOTAL-CHISACHON-MITZTABER-TZAFUY",
    };
  }
  return fields;
}

/** The candidates with their annuity fields filled in for one person's retirement age. */
export function withAnnuityFields(
  candidates: ImportedAccountCandidate[],
  retirementAge: number,
): ImportedAccountCandidate[] {
  return candidates.map((candidate) => ({
    ...candidate,
    fields: { ...candidate.fields, ...annuityFieldsFor(candidate, retirementAge) },
  }));
}
