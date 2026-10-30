// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildOutput, createPriceCollector, findProblem, readCompanyNames } from "./build.ts";

function collect(rows: string[][], header = ["Date", "Symbol", "Open", "Close"]) {
  const collector = createPriceCollector();
  collector.addRecord(header);
  for (const row of rows) collector.addRecord(row);
  return collector;
}

describe("createPriceCollector", () => {
  it("collects one sorted price list per symbol", () => {
    const series = collect([
      ["2024-01-03", "AAA", "9", "10.5"],
      ["2024-01-02", "AAA", "9", "10"],
      ["2024-01-02", "bbb", "9", "20.123456"],
    ]).finish();
    expect(series.get("AAA")).toEqual({ dates: ["2024-01-02", "2024-01-03"], close: [10, 10.5] });
    expect(series.get("BBB")).toEqual({ dates: ["2024-01-02"], close: [20.1235] });
  });

  it("skips rows with no price, a bad price or a bad date, and keeps the last row of a repeated date", () => {
    const collector = collect([
      ["2024-01-02", "AAA", "9", ""],
      ["2024-01-03", "AAA", "9", "abc"],
      ["2024-01-04", "AAA", "9", "0"],
      ["not a date", "AAA", "9", "5"],
      ["2024-01-05", "AAA", "9", "7"],
      ["2024-01-05", "AAA", "9", "8"],
      ["2024-01-06 00:00:00", "AAA", "9", "9"],
      ["2024-01-07", "AAA"],
    ]);
    expect(collector.finish().get("AAA")).toEqual({
      dates: ["2024-01-05", "2024-01-06"],
      close: [8, 9],
    });
  });

  it("drops a symbol that has no usable price", () => {
    expect(collect([["2024-01-02", "AAA", "9", ""]]).finish().size).toBe(0);
  });

  it("names the missing column", () => {
    const collector = createPriceCollector("prices.csv");
    expect(() => collector.addRecord(["Date", "Symbol", "Open"])).toThrow("Column 'close' not found in 'prices.csv'");
  });
});

describe("readCompanyNames", () => {
  it("maps symbols to company names", () => {
    const names = readCompanyNames([
      ["Symbol", "Company", "Sector"],
      ["aaa", "Alpha Corp", "Tech"],
      ["BBB", "", "Tech"],
    ]);
    expect([...names]).toEqual([["AAA", "Alpha Corp"]]);
  });

  it("needs a symbol column and a name column", () => {
    expect(() => readCompanyNames([["Ticker", "Company"]])).toThrow("needs a 'symbol' column");
  });
});

describe("buildOutput", () => {
  const series = collect([
    ["2024-01-02", "BRK-B", "1", "400"],
    ["2024-01-03", "BRK-B", "1", "401"],
    ["2024-01-02", "AAA", "1", "10"],
  ]).finish();
  const output = buildOutput(series, new Map([["AAA", "Alpha Corp"]]), "test-source", "2024-01-04T00:00:00.000Z");

  it("lists the symbols in order with a name and the first and last date", () => {
    expect(output.index).toEqual({
      generatedAtUtc: "2024-01-04T00:00:00.000Z",
      source: "test-source",
      symbols: [
        { symbol: "AAA", name: "Alpha Corp", firstDate: "2024-01-02", lastDate: "2024-01-02" },
        { symbol: "BRK-B", name: "BRK-B", firstDate: "2024-01-02", lastDate: "2024-01-03" },
      ],
    });
  });

  it("writes one file per symbol under a safe file name", () => {
    expect([...output.files.keys()]).toEqual(["AAA.json", "BRK-B.json"]);
    expect(output.files.get("BRK-B.json")).toEqual({
      symbol: "BRK-B",
      name: "BRK-B",
      asOf: "2024-01-03",
      priceBasis: "adjusted-close",
      dates: ["2024-01-02", "2024-01-03"],
      close: [400, 401],
    });
  });

  it("refuses two symbols that would share a file name", () => {
    const clash = collect([
      ["2024-01-02", "A/B", "1", "1"],
      ["2024-01-02", "A\\B", "1", "1"],
    ]).finish();
    expect(() => buildOutput(clash, new Map(), "s", "t")).toThrow("file name 'A_B.json'");
  });
});

describe("findProblem", () => {
  const output = buildOutput(
    collect([
      ["2024-01-02", "AAA", "1", "10"],
      ["2024-01-02", "BBB", "1", "10"],
    ]).finish(),
    new Map(),
    "s",
    "t",
  );
  const now = new Date("2024-01-05T12:00:00Z");

  it("accepts fresh data with enough symbols", () => {
    expect(findProblem(output, { now, maxAgeDays: 7, minSymbols: 2 })).toBeNull();
  });

  it("rejects too few symbols", () => {
    expect(findProblem(output, { now, maxAgeDays: 7, minSymbols: 3 })).toContain("Only 2 symbols");
  });

  it("rejects stale data, unless the age check is turned off", () => {
    const later = new Date("2024-02-01T00:00:00Z");
    expect(findProblem(output, { now: later, maxAgeDays: 7, minSymbols: 2 })).toContain("looks stale");
    expect(findProblem(output, { now: later, maxAgeDays: 0, minSymbols: 2 })).toBeNull();
  });
});
