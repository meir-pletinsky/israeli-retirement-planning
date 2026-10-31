import { mapClearingHouseReport, mergeReportResults } from "./mapReport";
import { ClearingHouseImportError } from "./errors";
import { readReportFiles, type ReadOptions, type ReportSource } from "./readFiles";
import type { ReportMapResult } from "./types";
import { parseXmlToTree } from "./xmlTree";

export * from "./errors";
export * from "./matchAndApply";
export * from "./ownerCheck";
export * from "./sample";
export { annuityFieldsFor, nearestProjection, withAnnuityFields } from "./annuity";
export { mapClearingHouseReport, mergeReportResults, parseReportDate } from "./mapReport";
export { readReportFiles } from "./readFiles";
export type { ReportSource } from "./readFiles";
export * from "./types";

export interface ParsedReport {
  result: ReportMapResult;
  xmlFiles: number;
  ignoredFiles: number;
}

/** Parses already-read XML documents into one merged result. */
export function parseReportTexts(source: ReportSource, now: Date): ParsedReport {
  const results = source.xmlTexts.map((text, fileIndex) =>
    mapClearingHouseReport(parseXmlToTree(text), { now, fileIndex }),
  );
  const result = mergeReportResults(results);
  if (result.candidates.length === 0 && result.skipped.length === 0) {
    throw new ClearingHouseImportError("noAccounts");
  }
  return { result, xmlFiles: source.xmlTexts.length, ignoredFiles: source.ignoredFiles };
}

/** Reads and parses the files the user chose (XML and/or a zip of the report). */
export async function importClearingHouseFiles(
  files: File[],
  options: ReadOptions & { now?: Date } = {},
): Promise<ParsedReport> {
  const source = await readReportFiles(files, { password: options.password });
  return parseReportTexts(source, options.now ?? new Date());
}
