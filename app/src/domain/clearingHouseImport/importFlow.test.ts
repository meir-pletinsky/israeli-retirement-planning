import { describe, expect, it } from "vitest";
import { activePension, policy, product, report, toXml } from "../../test/fixtures/clearingHouse/builders";
import { ClearingHouseImportError } from "./errors";
import { isValidIsraeliId, sameIdNumber } from "./israeliId";
import { importClearingHouseFiles, parseReportTexts } from "./index";
import { node, numberAt, parseXmlToTree, textAt } from "./xmlTree";

const NOW = new Date("2026-06-15T12:00:00");

function xmlFile(text: string, name = "report.xml"): File {
  return new File([text], name, { type: "text/xml" });
}

describe("israeliId", () => {
  it("validates the check digit", () => {
    expect(isValidIsraeliId("000000018")).toBe(true);
    expect(isValidIsraeliId("123456782")).toBe(true);
    expect(isValidIsraeliId("123456789")).toBe(false);
    expect(isValidIsraeliId("12345678")).toBe(false);
    expect(isValidIsraeliId("abcdefghi")).toBe(false);
  });

  it("compares ignoring leading zeros and formatting", () => {
    expect(sameIdNumber("000000018", "18")).toBe(true);
    expect(sameIdNumber("12-34", "1234")).toBe(true);
    expect(sameIdNumber("", "0")).toBe(false);
    expect(sameIdNumber("1", "2")).toBe(false);
  });
});

describe("parseXmlToTree", () => {
  it("builds a tree, treating nil, empty and absent leaves alike", () => {
    const tree = parseXmlToTree(
      `<?xml version="1.0"?><R xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><A>5</A><B xsi:nil="true"/><C/><D><E> 7 </E></D></R>`,
    );
    expect(numberAt(tree, "A")).toBe(5);
    expect(textAt(tree, "B")).toBeNull();
    expect(textAt(tree, "C")).toBeNull();
    expect(textAt(tree, "Z")).toBeNull();
    expect(numberAt(tree, "D", "E")).toBe(7);
  });

  it("rejects malformed XML", () => {
    expect(() => parseXmlToTree("<a><b></a>")).toThrow(ClearingHouseImportError);
    expect(() => parseXmlToTree("not xml")).toThrow(ClearingHouseImportError);
  });

  it("turns non-numeric text into null", () => {
    expect(numberAt(node("R", [node("A", [], "abc")]), "A")).toBeNull();
  });
});

describe("parseReportTexts and importClearingHouseFiles", () => {
  const sample = toXml(report({}, product({}, activePension())));

  it("parses a serialised report end to end", () => {
    const { result, xmlFiles } = parseReportTexts({ xmlTexts: [sample], ignoredFiles: 2 }, NOW);
    expect(xmlFiles).toBe(1);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].fields.totalAccumulatedBalance?.value).toBe(120000);
  });

  it("reads plain XML files and ignores other files", async () => {
    const parsed = await importClearingHouseFiles(
      [xmlFile(sample), new File(["pdf"], "statement.pdf"), xmlFile(toXml(report({}, product({}, policy({ number: "9" })))), "b.XML")],
      { now: NOW },
    );
    expect(parsed.xmlFiles).toBe(2);
    expect(parsed.ignoredFiles).toBe(1);
    expect(parsed.result.candidates).toHaveLength(2);
  });

  it("reports what went wrong with a typed error", async () => {
    await expect(importClearingHouseFiles([], { now: NOW })).rejects.toMatchObject({ code: "noFiles" });
    await expect(importClearingHouseFiles([new File(["x"], "a.pdf")], { now: NOW })).rejects.toMatchObject({
      code: "noXmlFiles",
    });
    await expect(importClearingHouseFiles([xmlFile("<broken")], { now: NOW })).rejects.toMatchObject({
      code: "invalidXml",
    });
    await expect(importClearingHouseFiles([xmlFile("<Other/>")], { now: NOW })).rejects.toMatchObject({
      code: "notClearingHouseReport",
    });
    await expect(
      importClearingHouseFiles([xmlFile(toXml(report({}, product({ type: 8 }, policy()))))], { now: NOW }),
    ).resolves.toMatchObject({ result: { candidates: [], skipped: [{ reason: "noRetirementBalance" }] } });
  });

  it("reports a report with nothing in it", async () => {
    await expect(importClearingHouseFiles([xmlFile(toXml(report({})))], { now: NOW })).rejects.toMatchObject({
      code: "noAccounts",
    });
  });

  it("decodes a declared non-UTF-8 encoding", async () => {
    const xml = toXml(report({}, product({}, activePension()))).replace('encoding="UTF-8"', 'encoding="windows-1255"');
    const parsed = await importClearingHouseFiles([xmlFile(xml)], { now: NOW });
    expect(parsed.result.candidates).toHaveLength(1);
  });
});
