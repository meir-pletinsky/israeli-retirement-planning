import { describe, expect, it } from "vitest";

import { isIsoDate, parseRateResponse, rateUrl } from "./format";

describe("rateUrl", () => {
  it("asks for the Bank of Israel's rate of a pair of currencies, and nothing else", () => {
    expect(rateUrl()).toBe("https://api.frankfurter.dev/v2/rate/usd/ils?providers=boi");
  });

  it("adds the date when there is one", () => {
    expect(rateUrl("2019-03-16")).toBe(
      "https://api.frankfurter.dev/v2/rate/usd/ils?providers=boi&date=2019-03-16",
    );
  });
});

describe("isIsoDate", () => {
  it("accepts a calendar date written year-month-day", () => {
    expect(isIsoDate("2024-02-29")).toBe(true);
  });

  it.each(["", "2024-2-9", "29/02/2024", "2024-13-01", "2024-03-01T10:00:00Z", "today"])(
    "rejects %j",
    (value) => {
      expect(isIsoDate(value)).toBe(false);
    },
  );

  it("rejects values that are not text", () => {
    expect(isIsoDate(20240301)).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });
});

describe("parseRateResponse", () => {
  const answer = { date: "2026-10-30", base: "USD", quote: "ILS", rate: 3.118 };

  it("reads the day and the rate", () => {
    expect(parseRateResponse(answer)).toEqual({ date: "2026-10-30", rate: 3.118 });
  });

  it.each([
    ["not an object", "3.118"],
    ["null", null],
    ["another base", { ...answer, base: "EUR" }],
    ["another quote", { ...answer, quote: "EUR" }],
    ["no date", { ...answer, date: undefined }],
    ["a malformed date", { ...answer, date: "30/10/2026" }],
    ["a rate in text", { ...answer, rate: "3.118" }],
    ["a rate of zero", { ...answer, rate: 0 }],
    ["a negative rate", { ...answer, rate: -3 }],
    ["an infinite rate", { ...answer, rate: Number.POSITIVE_INFINITY }],
    ["an error answer", { status: 404, message: "not found" }],
  ])("gives null for %s", (_name, value) => {
    expect(parseRateResponse(value)).toBeNull();
  });
});
