import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { EMPTY_PROFILE } from "../types";
import { whatIfRanges } from "./whatIf";
import { EMPTY_WHAT_IF_DRAFT, isEmptyWhatIfDraft, readWhatIfDraft } from "./whatIfDraft";

const single = buildTestProfile({
  age: 55,
  retirementAge: 65,
  pensionBalances: [1_500_000],
  retirementMonthlyExpenses: 9_000,
  investmentReturnPct: 6,
  inflationPct: 2.5,
});

const couple = buildTestProfile({
  age: 55,
  retirementAge: 65,
  pensionBalances: [1_500_000],
  retirementMonthlyExpenses: 9_000,
  maritalStatus: "married",
  spouse: { age: 52, retirementAge: 63 },
});

describe("readWhatIfDraft", () => {
  it("returns a draft that still fits the plan as it is", () => {
    const saved = {
      overrides: { retirementAge: 62, inflationPct: 3, planningHorizonAge: 95, withdrawalStrategy: "taxableFirst" },
      basis: "sustainable",
      column: "investmentReturnPct",
    };

    expect(readWhatIfDraft(saved, single)).toBe(saved);
  });

  it("drops what cannot be read and pulls a value outside the sliders back in range", () => {
    const { max } = whatIfRanges(single).retirementAge;
    const read = readWhatIfDraft(
      {
        overrides: {
          retirementAge: 999,
          inflationPct: "3",
          investmentReturnPct: Number.NaN,
          spouseRetirementAge: 60,
          planningHorizonAge: 95,
          withdrawalStrategy: "mostly-gold",
          withdrawalMix: { studyFund: 50, shares: 50, deposits: 50 },
          unknown: 1,
        },
        basis: "elsewhere",
        column: "elsewhere",
      },
      single,
    );

    expect(read).toEqual({
      overrides: { retirementAge: max, planningHorizonAge: 95 },
      basis: "planned",
      column: "investmentReturnPct",
    });
  });

  it("reads a saved mix without an ESOP share as holding no ESOP", () => {
    const read = readWhatIfDraft(
      { ...EMPTY_WHAT_IF_DRAFT, overrides: { withdrawalMix: { studyFund: 50, shares: 30, deposits: 20 } } },
      single,
    );

    expect(read.overrides.withdrawalMix).toEqual({ studyFund: 50, esop: 0, shares: 30, deposits: 20 });
  });

  it("drops values that now equal the plan", () => {
    const read = readWhatIfDraft(
      { ...EMPTY_WHAT_IF_DRAFT, overrides: { investmentReturnPct: 6, retirementAge: 66 } },
      single,
    );

    expect(read.overrides).toEqual({ retirementAge: 66 });
  });

  it("keeps the spouse's values only while the plan covers a spouse", () => {
    const saved = { ...EMPTY_WHAT_IF_DRAFT, overrides: { spouseRetirementAge: 60 } };

    expect(readWhatIfDraft(saved, couple)).toBe(saved);
    expect(readWhatIfDraft(saved, single).overrides).toEqual({});
  });

  it("gives an empty draft when there is no plan to lay it over or nothing readable", () => {
    expect(readWhatIfDraft({ ...EMPTY_WHAT_IF_DRAFT, overrides: { retirementAge: 62 } }, EMPTY_PROFILE)).toEqual(
      EMPTY_WHAT_IF_DRAFT,
    );
    for (const unreadable of [null, undefined, "draft", 3, []]) {
      expect(readWhatIfDraft(unreadable, single)).toEqual(EMPTY_WHAT_IF_DRAFT);
    }
  });
});

describe("isEmptyWhatIfDraft", () => {
  it("is empty only when nothing differs from the starting view", () => {
    expect(isEmptyWhatIfDraft(EMPTY_WHAT_IF_DRAFT)).toBe(true);
    expect(isEmptyWhatIfDraft({ ...EMPTY_WHAT_IF_DRAFT, overrides: { inflationPct: 3 } })).toBe(false);
    expect(isEmptyWhatIfDraft({ ...EMPTY_WHAT_IF_DRAFT, basis: "sustainable" })).toBe(false);
  });
});
