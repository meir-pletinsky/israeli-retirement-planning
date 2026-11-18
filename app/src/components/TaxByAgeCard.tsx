import clsx from "clsx";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import {
  HEALTH_TAX_PERCENT,
  ratePercent,
  TAX_BY_AGE_RULES,
  TAX_RATES,
  type AgeTaxTreatment,
  type TaxAgeBand,
  type TaxByAge,
  type TaxByAgeAccount,
  type TaxByAgeRow,
  type TaxLine,
  TAX_AGE_BANDS,
} from "../domain";
import { formatNumber } from "../i18n/formatters";
import { useFormatAge } from "./useFormatAge";

interface TaxByAgeCardProps {
  taxByAge: TaxByAge;
}

const TAX = "myData.steps.pensionSavings.taxByAge";
const CATEGORY_LABEL_KEY = "myData.steps.pensionSavings.options.productCategory";

const BAND_LABEL_KEYS: Record<TaxAgeBand, string> = {
  before60: `${TAX}.band.before60`,
  from60: `${TAX}.band.from60`,
  fromStatutory: `${TAX}.band.fromStatutory`,
};

/** Keeps digits reading left to right when inserted into a right-to-left sentence. */
const isolate = (text: string) => `\u2066${text}\u2069`;

const percent = (value: number) => isolate(`${formatNumber(value, { maximumFractionDigits: 2 })}%`);
const range = (min: number, max: number) =>
  isolate(`${formatNumber(min, { maximumFractionDigits: 2 })}\u2013${formatNumber(max, { maximumFractionDigits: 2 })}%`);
const amount = (value: number) => isolate(`${formatNumber(value, { maximumFractionDigits: 0 })} \u20aa`);

function TreatmentText({ treatment }: { treatment: AgeTaxTreatment }) {
  const { t } = useTranslation();
  switch (treatment.kind) {
    case "unavailable":
      return <span className="text-slate-400">{t(`${TAX}.treatment.unavailable`)}</span>;
    case "penalty":
      return <span>{t(`${TAX}.treatment.penalty`, { rate: percent(treatment.ratePercent) })}</span>;
    case "exempt":
      return <span className="font-medium text-emerald-700">{t(`${TAX}.treatment.exempt`)}</span>;
    case "marginal":
      return (
        <span>
          {treatment.healthTax
            ? t(`${TAX}.treatment.marginalHealth`, {
                range: range(treatment.minPercent, treatment.maxPercent),
                health: range(HEALTH_TAX_PERCENT.reduced, HEALTH_TAX_PERCENT.full),
                insurance: range(
                  ratePercent(TAX_BY_AGE_RULES.earlyPensionNationalInsuranceReducedRate),
                  ratePercent(TAX_BY_AGE_RULES.earlyPensionNationalInsuranceFullRate),
                ),
              })
            : t(`${TAX}.treatment.marginal`, {
                range: range(treatment.minPercent, treatment.maxPercent),
              })}
        </span>
      );
    case "partlyExempt":
      return (
        <span>
          {t(`${TAX}.treatment.partlyExempt`, {
            exempt: percent(treatment.exemptPercent),
            year: isolate(String(treatment.taxYear)),
            range: range(treatment.minPercent, treatment.maxPercent),
          })}
        </span>
      );
    case "exemptUpToCap":
      return (
        <span>
          {t(`${TAX}.treatment.exemptUpToCap`, {
            cap: amount(TAX_BY_AGE_RULES.severanceExemptionPerServiceYear),
            range: range(treatment.minPercent, treatment.maxPercent),
          })}
        </span>
      );
    case "commutation":
    case "studyFundEarly":
      return (
        <span>
          {t(`${TAX}.treatment.${treatment.kind}`, {
            range: range(treatment.minPercent, treatment.maxPercent),
          })}
        </span>
      );
    case "flatGain":
      return (
        <span>
          {t(`${TAX}.treatment.flatGain.${treatment.gain}`, { rate: percent(treatment.ratePercent) })}
        </span>
      );
    case "unknown":
      return <span className="text-slate-600">{t(`${TAX}.treatment.unknown`)}</span>;
  }
}

function Cell({ lines }: { lines: TaxLine[] }) {
  const { t } = useTranslation();
  return (
    <ul className="space-y-1.5">
      {lines.map((line) => (
        <li key={`${line.condition ?? "always"}-${line.treatment.kind}`}>
          {line.condition && (
            <span className="block text-xs text-slate-500">
              {t(`${TAX}.condition.${line.condition}`, {
                minimum: amount(TAX_BY_AGE_RULES.minimumAnnuityMonthly),
              })}
            </span>
          )}
          <TreatmentText treatment={line.treatment} />
        </li>
      ))}
    </ul>
  );
}

function AccountBlock({
  account,
  finalExemption,
}: {
  account: TaxByAgeAccount;
  finalExemption: TaxByAge["finalExemption"];
}) {
  const { t } = useTranslation();
  const formatAge = useFormatAge();
  const headingId = useId();
  const category = t(`${CATEGORY_LABEL_KEY}.${account.category}`);
  const heading = account.providerName.trim() || category;
  const details = [heading === category ? null : category, account.policyNumber.trim() || null].filter(
    (part): part is string => part !== null,
  );
  const age = isolate(formatAge(account.statutoryAge));
  const risesLater = account.exemptionYear < finalExemption.year;
  const hasExemptRow = account.rows.some(({ cells }) =>
    cells.fromStatutory.some(({ treatment }) => treatment.kind === "partlyExempt"),
  );

  const rowFirstOfPart = (row: TaxByAgeRow, index: number) =>
    index === 0 || account.rows[index - 1].part !== row.part;

  const notes: { key: string; text: string }[] = [];
  if (hasExemptRow && risesLater) {
    notes.push({
      key: "exemptYear",
      text: t(`${TAX}.exemptYearNote`, {
        percent: percent(account.exemptPercent),
        year: isolate(String(account.exemptionYear)),
        finalPercent: percent(finalExemption.percent),
        finalYear: isolate(String(finalExemption.year)),
      }),
    });
  }
  if (account.category === "studyFund") {
    notes.push({
      key: "studyFund",
      text: t(`${TAX}.studyFundCeilings`, {
        salary: amount(TAX_BY_AGE_RULES.studyFundEmployeeSalaryMonthly),
        employee: amount(TAX_BY_AGE_RULES.studyFundEmployeeAnnualDeposits),
        selfEmployed: amount(TAX_BY_AGE_RULES.studyFundSelfEmployedAnnualDeposits),
        deduction: amount(TAX_BY_AGE_RULES.studyFundSelfEmployedDeduction),
      }),
    });
  }
  if (!account.partsFromBreakdown && new Set(account.rows.map(({ part }) => part)).size > 1) {
    notes.push({ key: "allParts", text: t(`${TAX}.allPartsNote`) });
  }

  // No overflow clipping on the panel: the global focus ring of a summary sits outside it and would be cut off.
  return (
    <details
      className="group mt-3 rounded-xl border border-slate-300 bg-white shadow-sm"
      role="group"
      aria-labelledby={headingId}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-[0.6875rem] border-s-4 border-s-brand-600 bg-brand-50 px-4 py-3 group-open:rounded-b-none group-open:border-b group-open:border-b-brand-200 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <h3 id={headingId} className="text-base font-semibold text-brand-900">
            {heading}
          </h3>
          {details.length > 0 && <span className="mt-0.5 block text-xs text-slate-600">{details.join(" \u00b7 ")}</span>}
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4 shrink-0 text-brand-700 transition-transform group-open:rotate-180"
        >
          <path d="M5 8l5 5 5-5" />
        </svg>
      </summary>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-3 py-2 text-start text-xs font-semibold text-slate-700 first:ps-4">
                {t(`${TAX}.partColumn`)}
              </th>
              {TAX_AGE_BANDS.map((band) => (
                <th key={band} className="px-3 py-2 text-start text-xs font-semibold text-slate-700 last:pe-4">
                  {t(BAND_LABEL_KEYS[band], { age })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {account.rows.map((row, index) => (
              <tr
                key={`${row.part}-${row.option}`}
                className={clsx(
                  "align-top border-t",
                  rowFirstOfPart(row, index) ? "border-slate-300" : "border-dashed border-slate-200",
                )}
              >
                <td className="px-3 py-2.5 first:ps-4">
                  {rowFirstOfPart(row, index) && (
                    <span className="block font-semibold text-slate-900">{t(`${TAX}.part.${row.part}`)}</span>
                  )}
                  <span className="block text-xs text-slate-600">{t(`${TAX}.option.${row.option}`)}</span>
                </td>
                {TAX_AGE_BANDS.map((band) => (
                  <td key={band} className="px-3 py-2.5 last:pe-4">
                    <Cell lines={row.cells[band]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {notes.length > 0 && (
        <div className="space-y-1 rounded-b-[0.6875rem] border-t border-slate-300 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
          {notes.map((note) => (
            <p key={note.key}>{note.text}</p>
          ))}
        </div>
      )}
    </details>
  );
}

export function TaxByAgeCard({ taxByAge }: TaxByAgeCardProps) {
  const { t } = useTranslation();
  const titleId = useId();

  if (taxByAge.accounts.length === 0 && taxByAge.skippedAccounts === 0) {
    return null;
  }

  return (
    <section aria-labelledby={titleId} className="card">
      <h2 id={titleId} className="text-base font-semibold text-slate-900">
        {t(`${TAX}.title`)}
      </h2>
      {taxByAge.accounts.length > 0 && <p className="mt-1 text-xs text-slate-500">{t(`${TAX}.intro`)}</p>}

      <div className="mt-2">
        {taxByAge.accounts.map((account) => (
          <AccountBlock key={`${account.member}-${account.id}`} account={account} finalExemption={taxByAge.finalExemption} />
        ))}
      </div>

      {taxByAge.skippedAccounts > 0 && (
        <p className="mt-3 text-xs text-slate-500">{t(`${TAX}.skipped`, { count: taxByAge.skippedAccounts })}</p>
      )}

      {taxByAge.accounts.length > 0 && (
        <details className="mt-3 text-sm text-slate-700">
          <summary className="cursor-pointer text-xs font-medium text-brand-700">{t(`${TAX}.howTitle`)}</summary>
          <ul className="mt-2 list-disc space-y-1 ps-5 text-xs text-slate-600">
            <li>{t(`${TAX}.howAges`)}</li>
            <li>{t(`${TAX}.howRates`)}</li>
            <li>{t(`${TAX}.howParts`)}</li>
            <li>{t(`${TAX}.howConditions`)}</li>
            <li>
              {t(`${TAX}.howHealth`, {
                bracket: amount(TAX_RATES.healthTaxReducedBracketMonthly),
                ceiling: amount(TAX_RATES.contributionCeilingMonthly),
              })}
            </li>
            <li>{t(`${TAX}.howReadOnly`)}</li>
          </ul>
        </details>
      )}
    </section>
  );
}
