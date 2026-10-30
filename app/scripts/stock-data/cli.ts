/**
 * Daily job: downloads the public S&P 500 price dataset and writes one small JSON file per stock
 * (plus an index of symbols) for the app to read. Run from the `app` folder:
 *
 *   npm run stock-data -- [--out public/stock-data] [--zip file.zip] [--max-age-days 7]
 *
 * Kaggle sign-in is optional: set KAGGLE_USERNAME and KAGGLE_KEY if the download asks for it.
 */
import { createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { parseArgs } from "node:util";
import { readDatasetZip, writeOutput } from "./dataset.ts";
import { findProblem } from "./build.ts";

const DATASET = "darkmatternet/s-and-p-500-stocks-25-years-of-data-updated-daily";
const DOWNLOAD_URL = `https://www.kaggle.com/api/v1/datasets/download/${DATASET}`;
const SOURCE = `kaggle.com/datasets/${DATASET}`;

async function download(destination: string): Promise<void> {
  const headers: Record<string, string> = {};
  const { KAGGLE_USERNAME, KAGGLE_KEY } = process.env;
  if (KAGGLE_USERNAME && KAGGLE_KEY) {
    headers.Authorization = `Basic ${Buffer.from(`${KAGGLE_USERNAME}:${KAGGLE_KEY}`).toString("base64")}`;
  }
  const response = await fetch(DOWNLOAD_URL, { headers, redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: HTTP ${response.status} ${response.statusText}.`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      out: { type: "string", default: "public/stock-data" },
      zip: { type: "string" },
      "max-age-days": { type: "string", default: "7" },
      "min-symbols": { type: "string", default: "400" },
    },
  });
  const maxAgeDays = Number(values["max-age-days"]);
  const minSymbols = Number(values["min-symbols"]);
  if (!Number.isFinite(maxAgeDays) || !Number.isFinite(minSymbols)) {
    throw new Error("--max-age-days and --min-symbols must be numbers.");
  }

  const log = (message: string) => console.log(message);
  const workDir = await mkdtemp(join(tmpdir(), "stock-data-"));
  try {
    let zipPath = values.zip;
    if (!zipPath) {
      zipPath = join(workDir, "dataset.zip");
      log("Downloading the dataset...");
      await download(zipPath);
      log(`Downloaded ${(((await stat(zipPath)).size) / 1_048_576).toFixed(1)} MB.`);
    }

    const now = new Date();
    const output = await readDatasetZip(zipPath, { source: SOURCE, generatedAtUtc: now.toISOString(), log });
    const problem = findProblem(output, { now, maxAgeDays, minSymbols });
    if (problem) throw new Error(problem);

    await writeOutput(values.out, output);
    log(`Wrote ${output.files.size} price files to '${values.out}'.`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
