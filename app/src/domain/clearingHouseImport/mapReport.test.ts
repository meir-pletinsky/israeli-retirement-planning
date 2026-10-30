import { describe, expect, it } from "vitest";
import {
  EMPLOYER_NAME,
  HOLDER_ID,
  PROVIDER_NAME,
  activePension,
  policy,
  product,
  report,
  type PolicyOptions,
  type ProductOptions,
} from "../../test/fixtures/clearingHouse/builders";
import { ClearingHouseImportError } from "./errors";
import { defaultSelectedFields } from "./matchAndApply";
import { mapClearingHouseReport, mergeReportResults, parseReportDate } from "./mapReport";
import { WARNING_SEVERITY, type ImportedAccountCandidate, type ImportWarning, type ReportMapResult } from "./types";
import { node, type XmlNode } from "./xmlTree";

const NOW = new Date("2026-06-15T12:00:00");

type PolicyInput = PolicyOptions | XmlNode;

const toPolicyNode = (input: PolicyInput): XmlNode => ("children" in input ? input : policy(input));

function mapOne(policyOptions: PolicyInput, productOptions: ProductOptions = {}): ReportMapResult {
  return mapClearingHouseReport(report({}, product(productOptions, toPolicyNode(policyOptions))), { now: NOW });
}

function candidateOf(policyOptions: PolicyInput, productOptions: ProductOptions = {}): ImportedAccountCandidate {
  const result = mapOne(policyOptions, productOptions);
  expect(result.candidates).toHaveLength(1);
  return result.candidates[0];
}

const codes = (warnings: ImportWarning[]) => warnings.map((warning) => warning.code);

describe("mapClearingHouseReport: an active comprehensive pension", () => {
  const candidate = candidateOf(activePension());

  it("maps identity, status and dates from coded elements", () => {
    expect(candidate.fields.providerName?.value).toBe(PROVIDER_NAME);
    expect(candidate.fields.productCategory).toMatchObject({ value: "comprehensivePension", confidence: "official" });
    expect(candidate.fields.accountStatus?.value).toBe("activeContributing");
    expect(candidate.fields.joinDate?.value).toBe("2020-01-15");
    expect(candidate.valuationDate).toBe("2026-05-31");
  });

  it("sums the balance rows of the policy", () => {
    expect(candidate.fields.totalAccumulatedBalance?.value).toBe(120000);
    expect(candidate.fields.severanceBalance?.value).toBe(30000);
  });

  it("reads the deposit rates and fees as official values", () => {
    expect(candidate.fields.employeeRatePercent).toMatchObject({ value: 6, confidence: "official" });
    expect(candidate.fields.employerRatePercent?.value).toBe(6.5);
    expect(candidate.fields.severanceRatePercent?.value).toBe(6);
    expect(candidate.fields.feeFromAccumulationPercent).toMatchObject({ value: 0.05, confidence: "official" });
    expect(candidate.fields.feeFromDepositPercent?.value).toBe(1.35);
  });

  it("picks the investment track", () => {
    expect(candidate.fields.investmentTrackName?.value).toBe("מסלול לדוגמה");
  });

  it("keeps the report's own projection for display, with the factors it implies", () => {
    expect(candidate.projections).toEqual([
      { age: 67, accumulation: 2000000, monthlyPension: 10000, guaranteedFactor: null, impliedFactor: 200 },
    ]);
    expect(candidate.fields).not.toHaveProperty("estimatedMonthlyAnnuity");
    expect(candidate.annuityBasis).toBe("factor");
  });

  it("holds the employer and plan names for display only", () => {
    expect(candidate.display).toEqual({ planName: "תוכנית לדוגמה", employerName: EMPLOYER_NAME });
  });
});

describe("privacy", () => {
  it("never lets the date of birth, employer or plan name reach an importable field", () => {
    const result = mapOne(activePension());
    const importable = JSON.stringify({ fields: result.candidates[0].fields, personal: result.personal, warnings: result.warnings });
    expect(importable).not.toContain("1980");
    expect(importable).not.toContain(EMPLOYER_NAME);
    expect(importable).not.toContain("תוכנית לדוגמה");
  });

  it("keeps a policy number that equals the holder ID, even without its leading zeros, and flags it", () => {
    const stripped = candidateOf(activePension({ number: "18" }));
    expect(stripped.fields.policyNumber).toMatchObject({ value: "18", confidence: "official" });
    expect(codes(stripped.warnings)).toContain("policyNumberIsHolderId");

    const full = candidateOf(activePension({ number: HOLDER_ID }));
    expect(full.fields.policyNumber?.value).toBe(HOLDER_ID);
    expect(codes(full.warnings)).toContain("policyNumberIsHolderId");
  });

  it("flags a nine-digit number that passes the ID check digit, whoever's it is", () => {
    const candidate = candidateOf(activePension({ number: "123456782" }), { holder: { id: "999999990" } });
    expect(candidate.fields.policyNumber?.value).toBe("123456782");
    expect(codes(candidate.warnings)).toContain("policyNumberIsHolderId");
  });

  it("keeps ordinary policy numbers without a flag", () => {
    const ordinary = candidateOf(activePension({ number: "5550001" }));
    expect(ordinary.fields.policyNumber?.value).toBe("5550001");
    expect(codes(ordinary.warnings)).not.toContain("policyNumberIsHolderId");
    expect(candidateOf(activePension({ number: "123456789" }), { holder: { id: "999999990" } }).fields.policyNumber?.value).toBe(
      "123456789",
    );
  });
});

describe("product category", () => {
  it.each([
    [2, 2, "comprehensivePension", "official"],
    [2, 3, "generalPension", "official"],
    [2, 1, "generalPension", "uncertain"],
    [1, null, "managersInsurance", "official"],
    [5, null, "managersInsurance", "official"],
    [3, null, "providentFund", "official"],
    [9, null, "investmentProvidentFund", "official"],
    [4, null, "studyFund", "official"],
  ])("SUG-MUTZAR %s / pension kind %s -> %s (%s)", (type, kind, category, confidence) => {
    const candidate = candidateOf(policy({ kerenType: kind }), { type });
    expect(candidate.fields.productCategory).toMatchObject({ value: category, confidence });
  });

  it("warns instead of guessing for an unknown product type or a pension of unknown kind", () => {
    const unknown = candidateOf(policy(), { type: 42 });
    expect(unknown.fields.productCategory).toBeUndefined();
    expect(codes(unknown.warnings)).toContain("productTypeUnknown");

    const noKind = candidateOf(policy({ kerenType: null }), { type: 2 });
    expect(noKind.fields.productCategory).toBeUndefined();
    expect(codes(noKind.warnings)).toContain("pensionTypeUnknown");
  });

  it("flags a basic pension kind for review", () => {
    expect(codes(candidateOf(policy({ kerenType: 1 }), { type: 2 }).warnings)).toContain("pensionTypeBasic");
  });

  it("explains an old (vatika) pension fund instead of flagging it as basic", () => {
    const candidate = candidateOf(policy({ kerenType: 1, vatika: 1 }), { type: 2 });
    expect(candidate.fields.productCategory).toMatchObject({ value: "generalPension", confidence: "derived" });
    expect(defaultSelectedFields(candidate, null)).toContain("productCategory");
    expect(codes(candidate.warnings)).toContain("oldPensionFund");
    expect(codes(candidate.warnings)).not.toContain("pensionTypeBasic");
    expect(WARNING_SEVERITY.oldPensionFund).toBe("info");
  });

  it("maps a preferred (adif) insurance policy and leaves old pension funds without a model", () => {
    expect(candidateOf(policy({ policyType: 2 }), { type: 1 }).fields.legacyPolicyModel?.value).toBe("adif");
    expect(candidateOf(policy({ policyType: 3 }), { type: 1 }).fields.legacyPolicyModel?.value).toBe("none");
    expect(candidateOf(policy({ policyType: 2, vatika: 1 }), { type: 2 }).fields.legacyPolicyModel).toBeUndefined();
  });
});

describe("account status", () => {
  it.each([
    [1, "activeContributing"],
    [2, "paidUpFrozen"],
    [6, "paidUpFrozen"],
    [7, "paidUpFrozen"],
  ])("code %s -> %s", (code, status) => {
    expect(candidateOf(activePension({ status: code })).fields.accountStatus?.value).toBe(status);
  });

  it.each([3, 4, 10])("skips a closed or cancelled record (code %s)", (code) => {
    const result = mapOne(activePension({ status: code }));
    expect(result.candidates).toHaveLength(0);
    expect(result.skipped).toEqual([{ reason: "closedOrCancelled", productTypeCode: 2 }]);
  });

  it.each([8, 9, 99, null])("leaves the status for the user when the code is %s", (code) => {
    const candidate = candidateOf(activePension({ status: code }));
    expect(candidate.fields.accountStatus).toBeUndefined();
    expect(codes(candidate.warnings)).toContain("statusUnknown");
  });

  it("never infers a paying annuity", () => {
    for (const code of [1, 2, 6, 7, 8, 9]) {
      expect(candidateOf(activePension({ status: code })).fields.accountStatus?.value).not.toBe("payingAnnuity");
    }
  });
});

describe("skipped records", () => {
  it.each([6, 7, 8, 10])("skips product type %s: no retirement balance", (type) => {
    const result = mapOne(policy(), { type });
    expect(result.candidates).toHaveLength(0);
    expect(result.skipped).toEqual([{ reason: "noRetirementBalance", productTypeCode: type }]);
  });

  it("skips a policy that carries no balance block", () => {
    const result = mapOne(policy({ noBalanceBlock: true }));
    expect(result.skipped).toEqual([{ reason: "noBalanceData", productTypeCode: 2 }]);
  });
});

describe("balances and dates", () => {
  it("never sums across policies", () => {
    const result = mapClearingHouseReport(
      report({}, product({}, policy({ number: "1001", balances: [{ total: 10 }] }), policy({ number: "1002", balances: [{ total: 20 }] }))),
      { now: NOW },
    );
    expect(result.candidates.map((candidate) => candidate.fields.totalAccumulatedBalance?.value)).toEqual([10, 20]);
  });

  it("omits a nil balance and warns about a negative one", () => {
    expect(candidateOf(policy({ balances: [{ total: null }] })).fields.totalAccumulatedBalance).toBeUndefined();
    const negative = candidateOf(policy({ balances: [{ total: -50 }] }));
    expect(negative.fields.totalAccumulatedBalance).toBeUndefined();
    expect(codes(negative.warnings)).toContain("negativeBalance");
  });

  it("omits an implausible or malformed join date", () => {
    expect(candidateOf(policy({ joinDate: "19001231" })).fields.joinDate).toBeUndefined();
    expect(candidateOf(policy({ joinDate: "20270101" })).fields.joinDate).toBeUndefined();
    expect(candidateOf(policy({ joinDate: "20200230" })).fields.joinDate).toBeUndefined();
    expect(codes(candidateOf(policy({ joinDate: "00000000" })).warnings)).toContain("joinDateImplausible");
  });

  it("falls back to the balance block date when the policy has no valuation date", () => {
    const candidate = candidateOf(policy({ valuation: null }));
    expect(candidate.valuationDate).toBeNull();
  });

  it("takes the unlock date from the earliest study-fund tag, and only for study funds", () => {
    const study = candidateOf(policy({ kerenType: null, unlockDates: ["20290601", "20280101"] }), { type: 4 });
    expect(study.fields.liquidityDate?.value).toBe("2028-01-01");
    const other = candidateOf(policy({ unlockDates: ["20280101"] }), { type: 3 });
    expect(other.fields.liquidityDate).toBeUndefined();
  });

  it("parses report dates strictly", () => {
    expect(parseReportDate("20240229")).toBe("2024-02-29");
    expect(parseReportDate("20230229")).toBeNull();
    expect(parseReportDate("2024-02-29")).toBeNull();
    expect(parseReportDate(null)).toBeNull();
  });
});

describe("contributions", () => {
  it("leaves frozen accounts without rates: the file keeps their historical rates", () => {
    const candidate = candidateOf(activePension({ status: 2 }));
    expect(candidate.fields.employeeRatePercent).toBeUndefined();
    expect(candidate.fields.employerRatePercent).toBeUndefined();
  });

  it("derives a rate from the deposit amount and salary when no percent is given", () => {
    const candidate = candidateOf(
      policy({ salary: 10000, deposits: [{ type: 2, percent: null, amount: 600 }, { type: 3, percent: null, amount: 650 }] }),
    );
    expect(candidate.fields.employeeRatePercent).toMatchObject({ value: 6, confidence: "derived" });
    expect(candidate.fields.employerRatePercent?.value).toBe(6.5);
    expect(codes(candidate.warnings)).toContain("contributionRatesDerived");
  });

  it("warns, rather than guessing, when an amount cannot be turned into a rate", () => {
    const candidate = candidateOf(policy({ salary: null, deposits: [{ type: 2, percent: null, amount: 600 }] }));
    expect(candidate.fields.employeeRatePercent).toBeUndefined();
    expect(codes(candidate.warnings)).toContain("contributionRatesMissingSalary");
  });

  it("sums split rows of the same kind and ignores deposits by National Insurance, parents and transfers", () => {
    const candidate = candidateOf(
      policy({
        deposits: [
          { type: 3, depositor: 2, percent: 4 },
          { type: 3, depositor: 3, percent: 2.5 },
          { type: 3, depositor: 4, percent: 9 },
          { type: 3, depositor: 5, percent: 9 },
          { type: 3, depositor: 6, percent: 9 },
        ],
      }),
    );
    expect(candidate.fields.employerRatePercent?.value).toBe(6.5);
  });

  it("maps study-fund employee and employer deposits", () => {
    const candidate = candidateOf(
      policy({ kerenType: null, deposits: [{ type: 8, percent: 2.5 }, { type: 9, percent: 7.5 }] }),
      { type: 4 },
    );
    expect(candidate.fields.employeeRatePercent?.value).toBe(2.5);
    expect(candidate.fields.employerRatePercent?.value).toBe(7.5);
  });

  it("imports the salary on the policy as the base the account's rates apply to", () => {
    const candidate = candidateOf(policy({ salary: 12345, deposits: [{ type: 2, percent: 6 }, { type: 3, percent: 6.5 }] }));
    expect(candidate.fields.monthlySalaryBase).toMatchObject({
      value: 12345,
      confidence: "official",
      source: "SACHAR-POLISA",
    });
  });

  it("keeps a separate base per account when the salaries differ", () => {
    const pension = candidateOf(policy({ salary: 6000, deposits: [{ type: 2, percent: 6 }] }));
    const studyFund = candidateOf(policy({ salary: 10000, kerenType: null, deposits: [{ type: 8, percent: 2.5 }] }), { type: 4 });
    expect(pension.fields.monthlySalaryBase?.value).toBe(6000);
    expect(studyFund.fields.monthlySalaryBase?.value).toBe(10000);
  });

  it("imports no salary base without a usable salary, for frozen accounts, or without positive rates", () => {
    expect(candidateOf(policy({ salary: null, deposits: [{ type: 2, percent: 6 }] })).fields.monthlySalaryBase).toBeUndefined();
    expect(candidateOf(policy({ salary: 0, deposits: [{ type: 2, percent: 6 }] })).fields.monthlySalaryBase).toBeUndefined();
    expect(candidateOf(activePension({ status: 2 })).fields.monthlySalaryBase).toBeUndefined();
    expect(candidateOf(policy({ salary: 9000, deposits: [{ type: 2, percent: 0 }] })).fields.monthlySalaryBase).toBeUndefined();
  });

  it("imports explicit zeros only when another group is positive", () => {
    const mixed = candidateOf(policy({ deposits: [{ type: 2, percent: 0 }, { type: 3, percent: 6.5 }] }));
    expect(mixed.fields.employeeRatePercent?.value).toBe(0);
    const allZero = candidateOf(policy({ deposits: [{ type: 2, percent: 0 }, { type: 3, percent: 0 }] }));
    expect(allZero.fields.employeeRatePercent).toBeUndefined();
    expect(allZero.fields.employerRatePercent).toBeUndefined();
  });

  it("warns about a positive deposit of a kind the plan does not model, but not about informational or empty ones", () => {
    const candidate = candidateOf(
      policy({
        deposits: [
          { type: 2, percent: 6 },
          { type: 10, amount: 300 },
          { type: 11, amount: 0 },
          { type: 4, amount: 100 },
        ],
      }),
    );
    expect(candidate.warnings).toEqual(
      expect.arrayContaining([{ code: "contributionTypeNotModelled", params: { type: 10 } }]),
    );
    expect(candidate.warnings.filter((warning) => warning.code === "contributionTypeNotModelled")).toHaveLength(1);
  });
});

describe("fees", () => {
  it("ignores an implausible extra row without asking for confirmation", () => {
    const candidate = candidateOf(
      policy({ feeRows: [{ basis: 1, rate: 0.6 }, { basis: 1, rate: 15 }, { basis: 2, rate: 1.2 }] }),
    );
    expect(candidate.fields.feeFromAccumulationPercent).toMatchObject({ value: 0.6, confidence: "official" });
    expect(candidate.fields.feeFromDepositPercent?.value).toBe(1.2);
    expect(codes(candidate.warnings)).not.toContain("feeRowsDiffer");
    expect(defaultSelectedFields(candidate, null)).toContain("feeFromAccumulationPercent");
  });

  it("takes the highest plausible value and flags rows that genuinely disagree", () => {
    const candidate = candidateOf(policy({ feeRows: [{ basis: 1, rate: 0.6 }, { basis: 1, rate: 1.1 }] }));
    expect(candidate.fields.feeFromAccumulationPercent).toMatchObject({ value: 1.1, confidence: "uncertain" });
    expect(codes(candidate.warnings)).toContain("feeRowsDiffer");
  });

  it("omits a fee that is implausible in every row", () => {
    const candidate = candidateOf(policy({ feeRows: [{ basis: 1, rate: 15 }, { basis: 2, rate: 1 }] }));
    expect(candidate.fields.feeFromAccumulationPercent).toBeUndefined();
    expect(candidate.fields.feeFromDepositPercent?.value).toBe(1);
  });

  it("omits all fees when every value is zero, and says so", () => {
    const candidate = candidateOf(
      policy({ feeRows: [{ basis: 1, rate: 0 }, { basis: 2, rate: 0 }], monthlyAccumulationFee: 0, actualDepositFee: null }),
    );
    expect(candidate.fields.feeFromAccumulationPercent).toBeUndefined();
    expect(candidate.fields.feeFromDepositPercent).toBeUndefined();
    expect(codes(candidate.warnings)).toContain("feesAllZero");
  });

  it("is quiet when the report carries no fee data at all", () => {
    const candidate = candidateOf(policy());
    expect(codes(candidate.warnings)).not.toContain("feesAllZero");
  });

  it("imports a zero fee next to a positive one", () => {
    const candidate = candidateOf(policy({ feeRows: [{ basis: 1, rate: 0 }, { basis: 2, rate: 1.5 }] }));
    expect(candidate.fields.feeFromAccumulationPercent?.value).toBe(0);
    expect(candidate.fields.feeFromDepositPercent?.value).toBe(1.5);
  });

  it("falls back to the monthly actuals, marked as derived", () => {
    const candidate = candidateOf(policy({ monthlyAccumulationFee: 0.005, actualDepositFee: 1.4 }));
    expect(candidate.fields.feeFromAccumulationPercent).toMatchObject({ value: 0.06, confidence: "derived" });
    expect(candidate.fields.feeFromDepositPercent).toMatchObject({ value: 1.4, confidence: "derived" });
  });

  it("warns when the structure rate and the annualised monthly fee disagree", () => {
    const candidate = candidateOf(policy({ feeRows: [{ basis: 1, rate: 0.05 }], monthlyAccumulationFee: 0.03 }));
    expect(codes(candidate.warnings)).toContain("feeAccumulationMismatch");
    const close = candidateOf(policy({ feeRows: [{ basis: 1, rate: 0.05 }], monthlyAccumulationFee: 0.004 }));
    expect(codes(close.warnings)).not.toContain("feeAccumulationMismatch");
  });
});

describe("investment track", () => {
  it("chooses the largest accumulation track", () => {
    const candidate = candidateOf(
      policy({
        tracks: [
          { role: 1, name: "קטן", amount: 10 },
          { role: 1, name: "גדול", amount: 900 },
          { role: 2, name: "גדול", amount: null },
        ],
      }),
    );
    expect(candidate.fields.investmentTrackName).toMatchObject({ value: "גדול", confidence: "official" });
    expect(codes(candidate.warnings)).not.toContain("trackDiffersFromDeposit");
  });

  it("notes when new deposits go to a different track", () => {
    const candidate = candidateOf(
      policy({ tracks: [{ role: 1, name: "א", amount: 5 }, { role: 2, name: "ב", amount: 1 }] }),
    );
    expect(codes(candidate.warnings)).toContain("trackDiffersFromDeposit");
  });

  it("falls back to the deposit track as a pre-selected, derived value with a note", () => {
    const candidate = candidateOf(policy({ tracks: [{ role: 2, name: "ב", amount: 1 }] }));
    expect(candidate.fields.investmentTrackName).toMatchObject({ value: "ב", confidence: "derived" });
    expect(defaultSelectedFields(candidate, null)).toContain("investmentTrackName");
    expect(codes(candidate.warnings)).toContain("trackFromDepositOnly");
  });
});

describe("insurance coverages", () => {
  it("prefers the basic death sum and sums across coverage records", () => {
    const candidate = candidateOf(
      policy({
        coverages: [
          { basicDeath: 300000, pensionDisability: 8000 },
          { basicDeath: 200000 },
        ],
        riskCost: 120,
      }),
      { type: 1 },
    );
    expect(candidate.fields.deathCoverageAmount).toMatchObject({ value: 500000, confidence: "derived" });
    expect(candidate.fields.monthlyDisabilityAmount?.value).toBe(8000);
    expect(candidate.fields.monthlyRiskDeduction?.value).toBe(120);
  });

  it("falls back to the coverage blocks by type", () => {
    const candidate = candidateOf(
      policy({
        coverages: [
          {
            basicDeath: 0,
            blocks: [
              { type: 1, amount: 100000 },
              { type: 3, amount: 50000 },
              { type: 2, amount: 4000 },
              { type: 5, amount: 1000 },
              { type: 9, amount: 777 },
            ],
          },
        ],
      }),
      { type: 1 },
    );
    expect(candidate.fields.deathCoverageAmount?.value).toBe(150000);
    expect(candidate.fields.monthlyDisabilityAmount?.value).toBe(5000);
  });

  it("imports nothing when there are no positive amounts", () => {
    const candidate = candidateOf(policy({ coverages: [{ basicDeath: 0, pensionDisability: 0 }], riskCost: 0 }), { type: 1 });
    expect(candidate.fields.deathCoverageAmount).toBeUndefined();
    expect(candidate.fields.monthlyDisabilityAmount).toBeUndefined();
    expect(candidate.fields.monthlyRiskDeduction).toBeUndefined();
  });
});

describe("report projections", () => {
  it("lists every age, sorted, and uses the with-premiums pension before the without-premiums one", () => {
    const candidate = candidateOf(
      policy({
        projections: [
          { age: 67, accumulation: 900, kupot: [{ zikna: 5, hodshit: 3 }] },
          { age: 60, accumulation: 500, kupot: [{ zikna: null, hodshit: 2 }] },
        ],
      }),
    );
    expect(candidate.projections).toEqual([
      { age: 60, accumulation: 500, monthlyPension: 2, guaranteedFactor: null, impliedFactor: null },
      { age: 67, accumulation: 900, monthlyPension: 5, guaranteedFactor: null, impliedFactor: 180 },
    ]);
  });

  it("sums the funds of one age and ignores age 0 and empty projections", () => {
    const candidate = candidateOf(
      policy({
        projections: [
          { age: 67, accumulation: null, kupot: [{ zikna: 2 }, { zikna: 3 }] },
          { age: 0, accumulation: 1, kupot: [{ zikna: 1 }] },
          { age: 65, accumulation: null, kupot: [] },
        ],
      }),
    );
    expect(candidate.projections).toEqual([
      { age: 67, accumulation: null, monthlyPension: 5, guaranteedFactor: null, impliedFactor: null },
    ]);
  });

  it("derives the factor from the accumulation and the summed pension of all funds", () => {
    const candidate = candidateOf(
      policy({ projections: [{ age: 67, accumulation: 1000, kupot: [{ zikna: 2 }, { zikna: 3 }] }] }),
    );
    expect(candidate.projections[0].impliedFactor).toBe(200);
  });

  it("falls back to the without-premiums pair when the with-premiums pension is missing", () => {
    const candidate = candidateOf(
      policy({ projections: [{ age: 67, accumulationWithout: 1500, kupot: [{ zikna: null, hodshit: 10 }] }] }),
    );
    expect(candidate.projections[0]).toMatchObject({ monthlyPension: 10, impliedFactor: 150 });
  });

  it("reads a positive guaranteed factor and drops a nil or zero one", () => {
    const candidate = candidateOf(
      policy({
        projections: [
          { age: 60, accumulation: 100, guaranteedFactor: 150.5 },
          { age: 65, accumulation: 100, guaranteedFactor: null },
          { age: 67, accumulation: 100, guaranteedFactor: 0 },
        ],
      }),
    );
    expect(candidate.projections.map((entry) => entry.guaranteedFactor)).toEqual([150.5, null, null]);
  });
});

describe("annuity basis", () => {
  it.each([
    ["a new comprehensive pension", { type: 2 }, { kerenType: 2, vatika: 2 }, "factor"],
    ["an old comprehensive pension", { type: 2 }, { kerenType: 1, vatika: 1 }, "pension"],
    ["managers insurance", { type: 1 }, {}, "factor"],
    ["a provident fund", { type: 3 }, {}, null],
    ["a study fund", { type: 4 }, {}, null],
  ] as const)("is decided for %s", (_label, productOptions, policyOptions, expected) => {
    const candidate = candidateOf(
      policy({ ...policyOptions, projections: [{ age: 67, accumulation: 1000, kupot: [{ zikna: 5 }] }] }),
      productOptions,
    );
    expect(candidate.annuityBasis).toBe(expected);
  });
});

describe("personal suggestions", () => {
  it("suggests gender, age and marital status (the last as uncertain)", () => {
    const { personal } = mapOne(activePension());
    expect(personal.gender?.value).toBe("male");
    expect(personal.age?.value).toBe(46);
    expect(personal.maritalStatus).toMatchObject({ value: "married", confidence: "uncertain" });
  });

  it("maps the other codes and ignores unknown ones", () => {
    expect(mapOne(activePension(), { holder: { gender: 2, marital: 3 } }).personal).toMatchObject({
      gender: { value: "female" },
      maritalStatus: { value: "divorced" },
    });
    const unknown = mapOne(activePension(), { holder: { gender: 0, marital: 9 } }).personal;
    expect(unknown.gender).toBeUndefined();
    expect(unknown.maritalStatus).toBeUndefined();
  });

  it("counts a birthday that has not happened yet", () => {
    expect(mapOne(activePension(), { holder: { birthDate: "19800620" } }).personal.age?.value).toBe(45);
    expect(mapOne(activePension(), { holder: { birthDate: "19800615" } }).personal.age?.value).toBe(46);
  });

  it("drops an implausible age", () => {
    expect(mapOne(activePension(), { holder: { birthDate: "20240101" } }).personal.age).toBeUndefined();
  });

  it("takes the highest salary among active policies only", () => {
    const result = mapClearingHouseReport(
      report(
        {},
        product({}, activePension({ salary: 15000, number: "1" }), activePension({ salary: 22000, number: "2" })),
        product({}, activePension({ salary: 99000, status: 2, number: "3" })),
      ),
      { now: NOW },
    );
    expect(result.personal.monthlyGrossSalary?.value).toBe(22000);
  });

  it("drops a field the records disagree on, with a warning", () => {
    const result = mapClearingHouseReport(
      report({}, product({ holder: { gender: 1 } }, activePension({ number: "1" })), product({ holder: { gender: 2 } }, activePension({ number: "2" }))),
      { now: NOW },
    );
    expect(result.personal.gender).toBeUndefined();
    expect(result.warnings).toContainEqual({ code: "personalConflict", params: { field: "gender" } });
  });
});

describe("report-level checks", () => {
  it("rejects a file that is not a clearing-house report", () => {
    expect(() => mapClearingHouseReport(node("Other"), { now: NOW })).toThrow(ClearingHouseImportError);
  });

  it("warns about a stale report", () => {
    const stale = mapOne(activePension({ valuation: "20240930" }));
    expect(stale.warnings).toContainEqual({ code: "staleReport", params: { months: 20 } });
    expect(codes(mapOne(activePension({ valuation: "20260531" })).warnings)).not.toContain("staleReport");
  });

  it("notes a newer schema version", () => {
    const result = mapClearingHouseReport(report({ version: "012" }, product({}, activePension())), { now: NOW });
    expect(result.schemaVersion).toBe(12);
    expect(codes(result.warnings)).toContain("newerSchemaVersion");
    expect(codes(mapOne(activePension()).warnings)).not.toContain("newerSchemaVersion");
  });

  it("compares the declared product and provider counts but not the policy count", () => {
    const mismatch = mapClearingHouseReport(
      report({ declaredProducts: 3, declaredProviders: 2 }, product({}, activePension())),
      { now: NOW },
    );
    expect(mismatch.warnings).toEqual(
      expect.arrayContaining([
        { code: "controlCountMismatch", params: { what: "products", declared: 3, parsed: 1 } },
        { code: "controlCountMismatch", params: { what: "providers", declared: 2, parsed: 1 } },
      ]),
    );
    const manyPolicies = mapClearingHouseReport(
      report({}, product({}, activePension({ number: "1" }), activePension({ number: "2" }), activePension({ number: "3" }))),
      { now: NOW },
    );
    expect(codes(manyPolicies.warnings)).not.toContain("controlCountMismatch");
  });

  it("tolerates missing control counts, nil values and unknown elements", () => {
    const tree = report({ declaredProducts: null, declaredProviders: null }, product({}, policy()));
    tree.children[1].children.push(node("SOMETHING-NEW", [node("INNER", [], "x")]));
    expect(mapClearingHouseReport(tree, { now: NOW }).candidates).toHaveLength(1);
  });
});

describe("mergeReportResults", () => {
  it("combines files, keeps candidate keys unique and deduplicates warnings", () => {
    const one = mapClearingHouseReport(report({}, product({}, activePension({ number: "1" }))), { now: NOW, fileIndex: 0 });
    const two = mapClearingHouseReport(report({}, product({}, activePension({ number: "2" }))), { now: NOW, fileIndex: 1 });
    const merged = mergeReportResults([one, two]);
    expect(merged.candidates).toHaveLength(2);
    expect(new Set(merged.candidates.map((candidate) => candidate.key)).size).toBe(2);
    expect(merged.personal.gender?.value).toBe("male");
  });

  it("does not depend on the order of the files", () => {
    const build = (index: number, number: string, salary: number) =>
      mapClearingHouseReport(report({}, product({}, activePension({ number, salary }))), { now: NOW, fileIndex: index });
    const a = build(0, "1", 10000);
    const b = build(1, "2", 20000);
    const strip = (result: ReportMapResult) => ({
      fields: result.candidates.map((candidate) => candidate.fields).sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y))),
      personal: result.personal,
    });
    expect(strip(mergeReportResults([a, b]))).toEqual(strip(mergeReportResults([b, a])));
  });
});
