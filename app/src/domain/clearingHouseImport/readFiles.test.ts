import { describe, expect, it } from "vitest";
import { activePension, product, report, toXml } from "../../test/fixtures/clearingHouse/builders";
import { importClearingHouseFiles } from "./index";
import { MAX_REPORT_FILES, readReportFiles } from "./readFiles";

const NOW = new Date("2026-06-15T12:00:00");
const PASSWORD = "Invented-Pass-123";

type ZipEntrySpec = { name: string; content: string | Uint8Array };

async function makeZip(entries: ZipEntrySpec[], options: { password?: string; zipCrypto?: boolean } = {}): Promise<File> {
  const zip = await import("@zip.js/zip.js");
  zip.configure({ useWebWorkers: false });
  const writer = new zip.ZipWriter(new zip.Uint8ArrayWriter(), {
    password: options.password,
    zipCrypto: options.zipCrypto,
  });
  for (const entry of entries) {
    const reader =
      typeof entry.content === "string" ? new zip.TextReader(entry.content) : new zip.Uint8ArrayReader(entry.content);
    await writer.add(entry.name, reader);
  }
  const bytes = await writer.close();
  return new File([bytes as BlobPart], "report.zip", { type: "application/zip" });
}

const xmlOne = toXml(report({}, product({}, activePension({ number: "1001" }))));
const xmlTwo = toXml(report({}, product({}, activePension({ number: "1002" }))));

describe.each([
  ["ZipCrypto", { zipCrypto: true }],
  ["AES", { zipCrypto: false }],
])("password-protected zip (%s)", (_label, mode) => {
  const build = () =>
    makeZip(
      [
        { name: "first.xml", content: xmlOne },
        { name: "nested/second.XML", content: xmlTwo },
        { name: "statement.pdf", content: new Uint8Array([1, 2, 3]) },
        { name: "summary.xlsx", content: new Uint8Array([4, 5, 6]) },
      ],
      { password: PASSWORD, ...mode },
    );

  it("reads every XML file with the right password and skips the rest", async () => {
    const source = await readReportFiles([await build()], { password: PASSWORD });
    expect(source.xmlTexts).toHaveLength(2);
    expect(source.ignoredFiles).toBe(2);
  });

  it("imports straight from the archive", async () => {
    const parsed = await importClearingHouseFiles([await build()], { password: PASSWORD, now: NOW });
    expect(parsed.xmlFiles).toBe(2);
    expect(parsed.result.candidates.map((c) => c.fields.policyNumber?.value).sort()).toEqual(["1001", "1002"]);
  });

  it("asks for a password when none is given", async () => {
    await expect(readReportFiles([await build()])).rejects.toMatchObject({ code: "passwordRequired" });
  });

  it("recognises a wrong password", async () => {
    await expect(readReportFiles([await build()], { password: "wrong" })).rejects.toMatchObject({
      code: "wrongPassword",
    });
  });
});

describe("zip files without encryption", () => {
  it("reads without a password, and ignores a password that was given anyway", async () => {
    const file = await makeZip([{ name: "a.xml", content: xmlOne }]);
    expect((await readReportFiles([file])).xmlTexts).toHaveLength(1);
    expect((await readReportFiles([file], { password: "unused" })).xmlTexts).toHaveLength(1);
  });

  it("skips directories, resource-fork files and non-XML names", async () => {
    const file = await makeZip([
      { name: "__MACOSX/._a.xml", content: "junk" },
      { name: "folder/", content: "" },
      { name: "a.xml", content: xmlOne },
      { name: "notes.txt", content: "hello" },
    ]);
    const source = await readReportFiles([file]);
    expect(source.xmlTexts).toHaveLength(1);
    expect(source.ignoredFiles).toBe(2);
  });

  it("reports an archive without XML", async () => {
    const file = await makeZip([{ name: "a.pdf", content: new Uint8Array([1]) }]);
    await expect(readReportFiles([file])).rejects.toMatchObject({ code: "noXmlFiles" });
  });

  it("reports a corrupt archive", async () => {
    const good = await makeZip([{ name: "a.xml", content: xmlOne }]);
    const bytes = new Uint8Array(await good.arrayBuffer());
    const truncated = new File([bytes.slice(0, 20)], "broken.zip");
    await expect(readReportFiles([truncated])).rejects.toMatchObject({ code: "unreadableArchive" });
  });

  it("refuses too many files at once", async () => {
    const many = Array.from({ length: MAX_REPORT_FILES + 1 }, (_, index) => new File(["<a/>"], `f${index}.xml`));
    await expect(readReportFiles(many)).rejects.toMatchObject({ code: "tooManyFiles" });
  });
});
