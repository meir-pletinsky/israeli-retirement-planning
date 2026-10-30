// @vitest-environment node
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BlobWriter, TextReader, ZipWriter, configure } from "@zip.js/zip.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findProblem } from "./build.ts";
import { readDatasetZip, writeOutput } from "./dataset.ts";

configure({ useWebWorkers: false });

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), "stock-data-test-"));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

async function writeZip(entries: Record<string, string>): Promise<string> {
  const writer = new ZipWriter(new BlobWriter("application/zip"));
  for (const [name, text] of Object.entries(entries)) await writer.add(name, new TextReader(text));
  const blob = await writer.close();
  const path = join(workDir, "dataset.zip");
  await writeFile(path, Buffer.from(await blob.arrayBuffer()));
  return path;
}

const COMPANIES = 'Symbol,Company,Sector\nAAA,"Alpha, Inc.",Tech\nBBB,Beta Corp,Energy\n';
const PRICES = [
  "Date,Symbol,Open,High,Low,Close,Volume",
  "2024-01-02,AAA,1,1,1,10.5,100",
  "2024-01-03,AAA,1,1,1,11,100",
  "2024-01-02,BBB,1,1,1,20,100",
  "",
].join("\n");

describe("readDatasetZip", () => {
  it("reads the prices and the company names from the zip", async () => {
    const zipPath = await writeZip({ "sp500_stocks.csv": PRICES, "sp500_companies.csv": COMPANIES });
    const output = await readDatasetZip(zipPath, { source: "test", generatedAtUtc: "2024-01-04T00:00:00.000Z" });
    expect(output.index.symbols).toEqual([
      { symbol: "AAA", name: "Alpha, Inc.", firstDate: "2024-01-02", lastDate: "2024-01-03" },
      { symbol: "BBB", name: "Beta Corp", firstDate: "2024-01-02", lastDate: "2024-01-02" },
    ]);
    expect(output.files.get("AAA.json")?.close).toEqual([10.5, 11]);
    expect(findProblem(output, { now: new Date("2024-01-05T00:00:00Z"), maxAgeDays: 7, minSymbols: 2 })).toBeNull();
  });

  it("finds the files inside a folder of the zip", async () => {
    const zipPath = await writeZip({ "data/sp500_stocks.csv": PRICES, "data/sp500_companies.csv": COMPANIES });
    const output = await readDatasetZip(zipPath, { source: "test", generatedAtUtc: "t" });
    expect(output.files.size).toBe(2);
  });

  it("says which file is missing", async () => {
    const zipPath = await writeZip({ "sp500_stocks.csv": PRICES });
    await expect(readDatasetZip(zipPath, { source: "test", generatedAtUtc: "t" })).rejects.toThrow(
      "'sp500_companies.csv' is not in the downloaded zip",
    );
  });
});

describe("writeOutput", () => {
  it("writes the index and the price files, and replaces the files of an earlier run", async () => {
    const zipPath = await writeZip({ "sp500_stocks.csv": PRICES, "sp500_companies.csv": COMPANIES });
    const output = await readDatasetZip(zipPath, { source: "test", generatedAtUtc: "t" });
    const outDir = join(workDir, "out", "stock-data");

    await writeOutput(outDir, output);
    await writeFile(join(outDir, "STALE.json"), "{}");
    await writeOutput(outDir, output);

    expect((await readdir(outDir)).sort()).toEqual(["AAA.json", "BBB.json", "_index.json"]);
    expect(JSON.parse(await readFile(join(outDir, "AAA.json"), "utf8"))).toMatchObject({
      symbol: "AAA",
      dates: ["2024-01-02", "2024-01-03"],
    });
    expect((await readdir(join(workDir, "out"))).sort()).toEqual(["stock-data"]);
  });
});
