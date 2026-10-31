import type { TFunction } from "i18next";

import type { ImportedReport, PensionAccount } from "../../types";

const SOURCE = "clearingHouse.source";

/** "Dana, age 52": whoever the report is about, as far as the app kept it. */
export function reportPersonLabel(
  report: Pick<ImportedReport, "firstName" | "ageAtImport">,
  t: TFunction,
): string {
  const { firstName: name, ageAtImport: age } = report;
  if (name && age !== null) return t(`${SOURCE}.personNameAge`, { name, age });
  if (name) return t(`${SOURCE}.personName`, { name });
  if (age !== null) return t(`${SOURCE}.personAge`, { age });
  return t(`${SOURCE}.personUnknown`);
}

export function reportLabel(report: ImportedReport, t: TFunction): string {
  if (report.sample) return t(`${SOURCE}.sample`);
  const person = reportPersonLabel(report, t);
  const date = report.reportDate ?? report.importedAt;
  return date ? t(`${SOURCE}.report`, { person, date }) : t(`${SOURCE}.reportNoDate`, { person });
}

/** Where an account's data came from: typed by hand or imported from a report. */
export function accountSourceLabel(account: PensionAccount, reports: readonly ImportedReport[], t: TFunction): string {
  if (account.reportId === null) return t(`${SOURCE}.manual`);
  const report = reports.find((candidate) => candidate.id === account.reportId);
  return report ? reportLabel(report, t) : t(`${SOURCE}.imported`);
}
