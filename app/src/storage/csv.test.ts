import { describe, expect, it } from "vitest";

import { toCsv } from "./csv";

describe("toCsv", () => {
  it("starts with a byte order mark so that Excel reads Hebrew as UTF-8", () => {
    expect(toCsv([["גיל"]]).startsWith("\uFEFF")).toBe(true);
  });

  it("joins cells with commas and rows with CRLF", () => {
    expect(toCsv([["Age", "Income"], [67, 1_000]])).toBe("\uFEFFAge,Income\r\n67,1000\r\n");
  });

  it("leaves a missing value empty", () => {
    expect(toCsv([["a", null, undefined, 0]])).toBe("\uFEFFa,,,0\r\n");
  });

  it("quotes cells with a comma, a quote or a line break, and doubles the quotes", () => {
    expect(toCsv([["a,b", 'say "hi"', "two\nlines"]])).toBe('\uFEFF"a,b","say ""hi""","two\nlines"\r\n');
  });
});
