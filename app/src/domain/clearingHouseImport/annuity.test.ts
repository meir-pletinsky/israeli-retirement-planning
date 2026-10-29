import { describe, expect, it } from "vitest";

import { annuityFieldsFor, nearestProjection, withAnnuityFields } from "./annuity";
import type { AnnuityBasis, ImportedAccountCandidate, ReportProjection } from "./types";

function projection(age: number, overrides: Partial<ReportProjection> = {}): ReportProjection {
  return { age, accumulation: null, monthlyPension: null, guaranteedFactor: null, impliedFactor: null, ...overrides };
}

function candidate(
  annuityBasis: AnnuityBasis | null,
  projections: ReportProjection[],
): ImportedAccountCandidate {
  return {
    key: "a",
    productTypeCode: 2,
    fields: { providerName: { value: "Example", confidence: "official", source: "x" } },
    warnings: [],
    projections,
    annuityBasis,
    display: { planName: null, employerName: null },
    valuationDate: null,
  };
}

describe("nearestProjection", () => {
  it("picks the closest age that carries a figure", () => {
    const projections = [
      projection(60, { accumulation: 1 }),
      projection(65),
      projection(67, { accumulation: 5, monthlyPension: 2 }),
    ];
    expect(nearestProjection(projections, 65)?.age).toBe(67);
    expect(nearestProjection(projections, 58)?.age).toBe(60);
    expect(nearestProjection([], 67)).toBeNull();
    expect(nearestProjection([projection(67, { accumulation: 0 })], 67)).toBeNull();
  });

  it("honours a custom filter", () => {
    const projections = [projection(60, { impliedFactor: 150 }), projection(67, { accumulation: 9 })];
    expect(nearestProjection(projections, 67, (entry) => entry.impliedFactor !== null)?.age).toBe(60);
  });
});

describe("annuityFieldsFor: pension basis", () => {
  it("imports the monthly pension of the exact age as an official value", () => {
    const fields = annuityFieldsFor(candidate("pension", [projection(67, { monthlyPension: 3200 })]), 67);
    expect(fields).toEqual({
      estimatedMonthlyAnnuity: { value: 3200, confidence: "official", source: "SCHUM-KITZVAT-ZIKNA" },
    });
  });

  it("asks for confirmation when the age is not the retirement age", () => {
    const fields = annuityFieldsFor(
      candidate("pension", [projection(60, { monthlyPension: 2000 }), projection(67, { monthlyPension: 3200 })]),
      65,
    );
    expect(fields.estimatedMonthlyAnnuity).toMatchObject({ value: 3200, confidence: "uncertain" });
  });

  it("ignores ages without a pension and never imports a factor", () => {
    const fields = annuityFieldsFor(
      candidate("pension", [projection(67, { accumulation: 1000, impliedFactor: 180 })]),
      67,
    );
    expect(fields).toEqual({});
  });
});

describe("annuityFieldsFor: factor basis", () => {
  it("imports a guaranteed factor together with the guaranteed flag", () => {
    const fields = annuityFieldsFor(
      candidate("factor", [projection(67, { guaranteedFactor: 160.5, impliedFactor: 160.5 })]),
      67,
    );
    expect(fields.hasGuaranteedFactor).toMatchObject({ value: true, confidence: "official" });
    expect(fields.conversionFactor).toMatchObject({ value: 160.5, confidence: "official" });
    expect(fields).not.toHaveProperty("estimatedMonthlyAnnuity");
  });

  it("imports an implied factor as derived and leaves the guaranteed flag alone", () => {
    const fields = annuityFieldsFor(candidate("factor", [projection(67, { impliedFactor: 191.4 })]), 67);
    expect(fields.conversionFactor).toMatchObject({ value: 191.4, confidence: "derived" });
    expect(fields).not.toHaveProperty("hasGuaranteedFactor");
  });

  it("prefers a guaranteed factor over an implied one", () => {
    const fields = annuityFieldsFor(
      candidate("factor", [projection(67, { guaranteedFactor: 150, impliedFactor: 200 })]),
      67,
    );
    expect(fields.conversionFactor?.value).toBe(150);
  });

  it("uses the age nearest the retirement age and asks for confirmation when it differs", () => {
    const projections = [projection(60, { impliedFactor: 234.4 }), projection(65, { impliedFactor: 216.9 })];
    expect(annuityFieldsFor(candidate("factor", projections), 65).conversionFactor).toMatchObject({
      value: 216.9,
      confidence: "derived",
    });
    expect(annuityFieldsFor(candidate("factor", projections), 67).conversionFactor).toMatchObject({
      value: 216.9,
      confidence: "uncertain",
    });
  });

  it("flags a factor outside the range the form accepts", () => {
    const low = annuityFieldsFor(candidate("factor", [projection(67, { impliedFactor: 70 })]), 67);
    expect(low.conversionFactor).toMatchObject({ value: 70, confidence: "uncertain" });
    const high = annuityFieldsFor(candidate("factor", [projection(67, { guaranteedFactor: 400 })]), 67);
    expect(high.hasGuaranteedFactor?.confidence).toBe("uncertain");
    expect(high.conversionFactor?.confidence).toBe("uncertain");
  });

  it("imports nothing when no projection states a factor", () => {
    expect(annuityFieldsFor(candidate("factor", [projection(67, { accumulation: 1000 })]), 67)).toEqual({});
    expect(annuityFieldsFor(candidate("factor", []), 67)).toEqual({});
  });
});

describe("annuityFieldsFor: other products", () => {
  it("imports nothing for products that do not convert into an annuity", () => {
    const projections = [projection(67, { monthlyPension: 100, impliedFactor: 180, guaranteedFactor: 150 })];
    expect(annuityFieldsFor(candidate(null, projections), 67)).toEqual({});
  });
});

describe("withAnnuityFields", () => {
  it("merges the annuity fields into each candidate without touching the originals", () => {
    const original = candidate("factor", [projection(67, { impliedFactor: 190 })]);
    const [merged] = withAnnuityFields([original], 67);
    expect(merged.fields.conversionFactor?.value).toBe(190);
    expect(merged.fields.providerName?.value).toBe("Example");
    expect(original.fields).not.toHaveProperty("conversionFactor");
  });
});
