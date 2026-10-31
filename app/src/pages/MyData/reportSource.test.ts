import { describe, expect, it } from "vitest";

import i18n from "../../i18n";
import { createEmptyPensionAccount, EMPTY_PROFILE, type ImportedReport } from "../../types";
import { withoutAccount } from "./pensionPeople";
import { accountSourceLabel, reportLabel, reportPersonLabel } from "./reportSource";

const t = i18n.getFixedT("en");

function record(overrides: Partial<ImportedReport> = {}): ImportedReport {
  return {
    id: "r1",
    owner: "self",
    personKeys: ["k"],
    firstName: "Dana",
    ageAtImport: 46,
    reportDate: "2026-05-01",
    importedAt: "2026-05-02",
    sample: false,
    ...overrides,
  };
}

describe("reportPersonLabel", () => {
  it("names the person and age as far as they are known", () => {
    expect(reportPersonLabel(record(), t)).toBe("Dana, age 46");
    expect(reportPersonLabel(record({ ageAtImport: null }), t)).toBe("Dana");
    expect(reportPersonLabel(record({ firstName: null }), t)).toBe("a person aged 46");
    expect(reportPersonLabel(record({ firstName: null, ageAtImport: null }), t)).toBe("an unnamed person");
  });
});

describe("accountSourceLabel", () => {
  const account = (reportId: string | null) => ({ ...createEmptyPensionAccount(), reportId });

  it("says an account without a report was added manually", () => {
    expect(accountSourceLabel(account(null), [record()], t)).toBe("Added manually");
  });

  it("names the report, its person and its date", () => {
    expect(accountSourceLabel(account("r1"), [record()], t)).toBe("Report of Dana, age 46 \u00b7 2026-05-01");
  });

  it("falls back to the import day when the report has no date", () => {
    expect(reportLabel(record({ reportDate: null }), t)).toBe("Report of Dana, age 46 \u00b7 2026-05-02");
    expect(reportLabel(record({ reportDate: null, importedAt: "" }), t)).toBe("Report of Dana, age 46");
  });

  it("marks the sample as made-up data", () => {
    expect(accountSourceLabel(account("r1"), [record({ sample: true })], t)).toBe("Sample report (made-up data)");
  });

  it("still says the account was imported when its report record is gone", () => {
    expect(accountSourceLabel(account("gone"), [], t)).toBe("Imported from a report");
  });
});

describe("withoutAccount", () => {
  const savings = (reportIds: (string | null)[]) => ({
    ...EMPTY_PROFILE.pensionSavings,
    accounts: reportIds.map((reportId, index) => ({ ...createEmptyPensionAccount(), id: `a${index}`, reportId })),
    reports: [record(), record({ id: "r2" })],
  });

  it("removes the account and keeps the report while another account still points at it", () => {
    const result = withoutAccount(savings(["r1", "r1"]), "a0");
    expect(result.accounts.map((account) => account.id)).toEqual(["a1"]);
    expect(result.reports.map((report) => report.id)).toEqual(["r1", "r2"]);
  });

  it("removes the report with its last account", () => {
    const result = withoutAccount(savings(["r1", "r2"]), "a0");
    expect(result.reports.map((report) => report.id)).toEqual(["r2"]);
  });

  it("leaves the reports alone when a manual account is removed", () => {
    const result = withoutAccount(savings([null, "r1"]), "a0");
    expect(result.reports).toHaveLength(2);
  });

  it("does nothing for an unknown account", () => {
    const original = savings(["r1"]);
    const result = withoutAccount(original, "missing");
    expect(result.accounts).toHaveLength(1);
    expect(result.reports).toHaveLength(2);
  });
});
