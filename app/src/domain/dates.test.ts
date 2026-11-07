import { describe, expect, it } from "vitest";

import { formatDate, formatLocalDate, isCompleteDateText, parseDate } from "./dates";

describe("formatDate", () => {
  it("shows an ISO date day first", () => {
    expect(formatDate("2024-03-01")).toBe("01/03/2024");
  });

  it("returns text that is not an ISO date unchanged", () => {
    expect(formatDate("soon")).toBe("soon");
  });
});

describe("formatLocalDate", () => {
  it("shows the day of a timestamp in the viewer's time zone, day first", () => {
    expect(formatLocalDate(new Date(2026, 2, 5, 23, 30).toISOString())).toBe("05/03/2026");
  });

  it("is empty for a timestamp that cannot be read", () => {
    expect(formatLocalDate("not a date")).toBe("");
  });
});

describe("parseDate", () => {
  it.each([
    ["2024-03-01", "2024-03-01"],
    ["2024/3/1", "2024-03-01"],
    ["01/03/2024", "2024-03-01"],
    ["1.3.2024", "2024-03-01"],
    ["01-03-2024", "2024-03-01"],
    ["01.03.2024.", "2024-03-01"],
    ["25/12/2023", "2023-12-25"],
    ["12/25/2023", "2023-12-25"],
    ["20240301", "2024-03-01"],
    ["01032024", "2024-03-01"],
    ["1 Mar 2024", "2024-03-01"],
    ["1st March 2024", "2024-03-01"],
    ["Mar 1, 2024", "2024-03-01"],
    ["March 01 2024", "2024-03-01"],
    ["2024 Mar 1", "2024-03-01"],
    ["Sept 5 2023", "2023-09-05"],
    ["2024-03-01T10:15:00Z", "2024-03-01"],
    ["01/03/2024 14:30", "2024-03-01"],
    ["  01/03/2024  ", "2024-03-01"],
    ["29/02/2024", "2024-02-29"],
  ])("reads %s as %s", (text, iso) => {
    expect(parseDate(text)).toBe(iso);
  });

  it.each(["", "soon", "30/02/2024", "31/04/2024", "2023-02-29", "13/13/2024", "1/1/1", "01/03/202", "01/03/24"])(
    "rejects %s",
    (text) => {
      expect(parseDate(text)).toBeNull();
    },
  );

  it("reads two-digit years only when asked to", () => {
    expect(parseDate("01/03/24", { twoDigitYear: true })).toBe("2024-03-01");
    expect(parseDate("01/03/99", { twoDigitYear: true })).toBe("1999-03-01");
    expect(parseDate("1 Mar 24", { twoDigitYear: true })).toBe("2024-03-01");
  });

  it("rejects implausible years", () => {
    expect(parseDate("01/01/1800")).toBeNull();
    expect(parseDate("01/01/2200")).toBeNull();
  });
});

describe("isCompleteDateText", () => {
  it("accepts whole dates and not half-typed ones", () => {
    expect(isCompleteDateText("01/03/2024")).toBe(true);
    expect(isCompleteDateText("2024-03-01")).toBe(true);
    expect(isCompleteDateText("01/03/202")).toBe(false);
    expect(isCompleteDateText("2024-03-0")).toBe(false);
    expect(isCompleteDateText("1/3/2024")).toBe(false);
  });
});
