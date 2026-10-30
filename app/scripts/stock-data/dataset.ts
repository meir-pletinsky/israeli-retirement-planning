import { openAsBlob } from "node:fs";
import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { BlobReader, ZipReader, configure, type FileEntry } from "@zip.js/zip.js";
import { INDEX_FILE_NAME } from "../../src/stockPrices/format.ts";
import {
  buildOutput,
  createPriceCollector,
  readCompanyNames,
  type DatasetOutput,
} from "./build.ts";
import { createCsvParser, parseCsv } from "./csv.ts";

configure({ useWebWorkers: false });

const PRICES_ENTRY = "sp500_stocks.csv";
const COMPANIES_ENTRY = "sp500_companies.csv";

export interface ReadDatasetOptions {
  source: string;
  generatedAtUtc: string;
  log?: (message: string) => void;
}

/** Reads the downloaded dataset zip. The big prices file is decoded and parsed as a stream. */
export async function readDatasetZip(zipPath: string, options: ReadDatasetOptions): Promise<DatasetOutput> {
  const log = options.log ?? (() => {});
  const reader = new ZipReader(new BlobReader(await openAsBlob(zipPath)));
  try {
    const entries = await reader.getEntries();
    const find = (name: string): FileEntry => {
      const entry = entries.find(
        (candidate): candidate is FileEntry =>
          !candidate.directory && basename(candidate.filename).toLowerCase() === name,
      );
      if (!entry) throw new Error(`'${name}' is not in the downloaded zip.`);
      return entry;
    };

    const companies = find(COMPANIES_ENTRY);
    const companiesText = await readEntryText(companies);
    const names = readCompanyNames(parseCsv(companiesText), COMPANIES_ENTRY);
    log(`Read ${names.size} company names.`);

    const collector = createPriceCollector(PRICES_ENTRY);
    const parser = createCsvParser((record) => collector.addRecord(record));
    const decoder = new TextDecoder("utf-8");
    await find(PRICES_ENTRY).getData(
      new WritableStream<Uint8Array>({
        write(chunk) {
          parser.write(decoder.decode(chunk, { stream: true }));
        },
        close() {
          parser.write(decoder.decode());
          parser.end();
        },
      }),
    );
    log(`Read ${collector.rowCount} price rows.`);

    return buildOutput(collector.finish(), names, options.source, options.generatedAtUtc);
  } finally {
    await reader.close();
  }
}

async function readEntryText(entry: FileEntry): Promise<string> {
  const chunks: string[] = [];
  const decoder = new TextDecoder("utf-8");
  await entry.getData(
    new WritableStream<Uint8Array>({
      write(chunk) {
        chunks.push(decoder.decode(chunk, { stream: true }));
      },
      close() {
        chunks.push(decoder.decode());
      },
    }),
  );
  return chunks.join("");
}

/**
 * Writes the files to a sibling folder first and swaps it in at the end, so a run that fails
 * half way never leaves the app with a mix of old and new files.
 */
export async function writeOutput(outDir: string, output: DatasetOutput): Promise<void> {
  const target = resolve(outDir);
  const staging = `${target}.new`;
  const previous = `${target}.old`;
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });

  await writeFile(join(staging, INDEX_FILE_NAME), JSON.stringify(output.index));
  for (const [fileName, file] of output.files) {
    await writeFile(join(staging, fileName), JSON.stringify(file));
  }

  await mkdir(dirname(target), { recursive: true });
  await rm(previous, { recursive: true, force: true });
  const hadPrevious = await exists(target);
  if (hadPrevious) await renameWithRetry(target, previous);
  await renameWithRetry(staging, target);
  if (hadPrevious) await rm(previous, { recursive: true, force: true });
}

/** On Windows a virus scanner can hold a folder for a moment after files were written to it. */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 10 || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) throw error;
      await new Promise((done) => setTimeout(done, attempt * 200));
    }
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await readdir(path);
    return true;
  } catch {
    return false;
  }
}
