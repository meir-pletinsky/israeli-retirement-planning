import { describe, expect, it } from "vitest";

import { cbsAnswer } from "../test/cpiFixtures";
import { cpiUrl, parseCpiResponse } from "./format";

describe("cpiUrl", () => {
  it("asks for the general index from January of the year, in one page, and sends nothing else", () => {
    expect(cpiUrl(1995)).toBe(
      "https://api.cbs.gov.il/index/data/price?id=120010&format=json&download=false&lang=en&startPeriod=01-1995&PageSize=1000",
    );
  });
});

describe("parseCpiResponse", () => {
  it("reads the 12-month change of each month, oldest first", () => {
    const answer = cbsAnswer([
      { year: 2026, month: 9, yearOverYearPct: 1.6 },
      { year: 2025, month: 12, yearOverYearPct: 2.6 },
      { year: 2026, month: 1, yearOverYearPct: 2.1 },
    ]);
    expect(parseCpiResponse(answer)).toEqual([
      { year: 2025, month: 12, yearOverYearPct: 2.6 },
      { year: 2026, month: 1, yearOverYearPct: 2.1 },
      { year: 2026, month: 9, yearOverYearPct: 1.6 },
    ]);
  });

  it("leaves out the months that have no 12-month change yet", () => {
    const answer = cbsAnswer([{ year: 1952, month: 9, yearOverYearPct: 5 }]);
    answer.month[0].date.push({ ...answer.month[0].date[0], year: 1951, month: 12, percentYear: null as never });
    expect(parseCpiResponse(answer)).toEqual([{ year: 1952, month: 9, yearOverYearPct: 5 }]);
  });

  it("takes the general index when the answer holds other series", () => {
    const other = { code: 200010, name: "Food", date: [{ year: 2026, month: 9, percentYear: 99 }] };
    const answer = cbsAnswer([{ year: 2026, month: 9, yearOverYearPct: 1.6 }], [other]);
    expect(parseCpiResponse(answer)).toEqual([{ year: 2026, month: 9, yearOverYearPct: 1.6 }]);
  });

  it("gives null for anything that is not an index answer", () => {
    expect(parseCpiResponse(null)).toBeNull();
    expect(parseCpiResponse("<html>")).toBeNull();
    expect(parseCpiResponse({})).toBeNull();
    expect(parseCpiResponse({ month: "x" })).toBeNull();
    expect(parseCpiResponse({ month: [{ code: 1, date: [] }] })).toBeNull();
    expect(parseCpiResponse({ month: [{ code: 120010, date: "x" }] })).toBeNull();
  });

  it("gives null when there is no month with a change", () => {
    expect(parseCpiResponse({ month: [{ code: 120010, date: [] }] })).toBeNull();
    expect(
      parseCpiResponse({ month: [{ code: 120010, date: [{ year: 1952, month: 1, percentYear: null }] }] }),
    ).toBeNull();
  });

  it("gives null when a month is not what it should be", () => {
    const entry = (patch: object) => ({
      month: [{ code: 120010, date: [{ year: 2026, month: 9, percentYear: 1.6, ...patch }] }],
    });
    expect(parseCpiResponse(entry({}))).not.toBeNull();
    expect(parseCpiResponse(entry({ year: "2026" }))).toBeNull();
    expect(parseCpiResponse(entry({ month: 13 }))).toBeNull();
    expect(parseCpiResponse(entry({ month: 0 }))).toBeNull();
    expect(parseCpiResponse(entry({ month: 9.5 }))).toBeNull();
    expect(parseCpiResponse(entry({ percentYear: "1.6" }))).toBeNull();
    expect(parseCpiResponse(entry({ percentYear: Number.NaN }))).toBeNull();
    expect(parseCpiResponse({ month: [{ code: 120010, date: [null] }] })).toBeNull();
  });
});
