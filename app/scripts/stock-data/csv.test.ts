// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createCsvParser, parseCsv } from "./csv.ts";

describe("parseCsv", () => {
  it("splits records and fields", () => {
    expect(parseCsv("a,b,c\n1,2,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("keeps the last record when there is no final line break", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("reads Windows line breaks as one break", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("reads quoted fields with commas, doubled quotes and line breaks", () => {
    expect(parseCsv('name,note\n"Acme, Inc.","said ""hi"""\n"two\nlines",x\n')).toEqual([
      ["name", "note"],
      ["Acme, Inc.", 'said "hi"'],
      ["two\nlines", "x"],
    ]);
  });

  it("keeps empty fields and skips blank lines", () => {
    expect(parseCsv("a,,c\n\n1,2,\n")).toEqual([
      ["a", "", "c"],
      ["1", "2", ""],
    ]);
  });

  it("gives the same records however the text is cut into chunks", () => {
    const text = 'sym,name\r\nAAA,"Alpha, ""One"""\r\nBBB,Beta\r\n';
    const expected = parseCsv(text);
    for (let size = 1; size <= text.length; size++) {
      const records: string[][] = [];
      const parser = createCsvParser((record) => records.push(record));
      for (let start = 0; start < text.length; start += size) parser.write(text.slice(start, start + size));
      parser.end();
      expect(records).toEqual(expected);
    }
  });
});
