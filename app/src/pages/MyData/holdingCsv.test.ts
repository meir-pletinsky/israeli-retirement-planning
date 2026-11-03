import { describe, expect, it } from "vitest";

import { parseHoldingCsv } from "./holdingCsv";

describe("parseHoldingCsv — private purchases", () => {
  it("reads date, symbol, quantity and price, upper-casing the symbol", () => {
    const { rows, ignored } = parseHoldingCsv(
      "15/03/2024, aapl, 10, 172.50\n2024-04-02, msft, 2.5",
      "personalBrokeragePurchase",
    );
    expect(ignored).toBe(0);
    expect(rows).toEqual([
      { line: 1, date: "2024-03-15", symbol: "AAPL", quantity: 10, priceUsd: 172.5 },
      { line: 2, date: "2024-04-02", symbol: "MSFT", quantity: 2.5, priceUsd: null },
    ]);
  });

  it("treats a zero price as missing", () => {
    const { rows } = parseHoldingCsv("01/02/2024,AAPL,1,0", "personalBrokeragePurchase");
    expect(rows[0].priceUsd).toBeNull();
  });

  it("ignores rows it cannot read", () => {
    const { rows, ignored } = parseHoldingCsv(
      ["not a date,AAPL,1", "01/02/2024,AAPL,abc", "01/02/2024,,5", "", "03/02/2024,AAPL,3"].join("\n"),
      "personalBrokeragePurchase",
    );
    expect(rows.map((row) => row.line)).toEqual([5]);
    expect(ignored).toBe(3);
  });

  it("uses a dot as the decimal point, never a comma", () => {
    const { rows, ignored } = parseHoldingCsv(
      "01/02/2024;AAPL;1,5\n01/02/2024;AAPL;1.5",
      "personalBrokeragePurchase",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(1.5);
    expect(ignored).toBe(1);
  });

  it("reads tab-separated text and quoted thousands", () => {
    const { rows } = parseHoldingCsv('01/02/2024\tAAPL\t"1,200"\t10', "personalBrokeragePurchase");
    expect(rows[0]).toMatchObject({ symbol: "AAPL", quantity: 1200, priceUsd: 10 });
  });

  it("understands a header line in any column order", () => {
    const { rows } = parseHoldingCsv(
      "Ticker,Qty,Purchase Date,Price\nnvda,4,03/05/2023,110",
      "personalBrokeragePurchase",
    );
    expect(rows).toEqual([
      { line: 2, date: "2023-05-03", symbol: "NVDA", quantity: 4, priceUsd: 110 },
    ]);
  });
});

describe("parseHoldingCsv — employer grants and purchases", () => {
  it("reads date, quantity and price without a symbol", () => {
    const { rows } = parseHoldingCsv("15/03/2024, 10, 172.50\n2024-04-02, 2.5", "employerGrantedStock");
    expect(rows).toEqual([
      { line: 1, date: "2024-03-15", symbol: null, quantity: 10, priceUsd: 172.5 },
      { line: 2, date: "2024-04-02", symbol: null, quantity: 2.5, priceUsd: null },
    ]);
  });

  it("ignores a symbol column", () => {
    const { rows } = parseHoldingCsv("Date,Symbol,Quantity\n01/02/2024,ABC,7", "employerEsppDiscount");
    expect(rows).toEqual([{ line: 2, date: "2024-02-01", symbol: null, quantity: 7, priceUsd: null }]);
  });

  it("returns nothing for empty text", () => {
    expect(parseHoldingCsv("  \n", "employerGrantedStock")).toEqual({ rows: [], ignored: 0 });
  });

  it("reads tab-separated text with a blank cell before the price and a trailing tab", () => {
    const { rows } = parseHoldingCsv(
      "Date\tQuantity\tShare price\t\nSEP/30/2026\t14.979\t\t461.61",
      "employerGrantedStock",
    );
    expect(rows).toEqual([
      { line: 2, date: "2026-09-30", symbol: null, quantity: 14.979, priceUsd: 461.61 },
    ]);
  });

  it("reads comma-separated text with or without spaces, even with a stray trailing tab", () => {
    const expected = [{ line: 2, date: "2026-09-30", symbol: null, quantity: 14.979, priceUsd: 461.61 }];
    expect(
      parseHoldingCsv("Date, Quantity, Share price\t\nSEP/30/2026, 14.979, 461.61", "employerGrantedStock").rows,
    ).toEqual(expected);
    expect(
      parseHoldingCsv("Date,Quantity,Share price\nSEP/30/2026,14.979,461.61", "employerGrantedStock").rows,
    ).toEqual(expected);
  });
});
