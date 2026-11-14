import clsx from "clsx";
import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  incomeYearDetails,
  type IdleSource,
  type IncomeBandKey,
  type IncomeBasis,
  type IncomeSourceLine,
  type IncomeSourceOrigin,
  type IncomeYearDetail,
} from "../../domain";
import type { ProfileData } from "../../types";
import { BandSwatch } from "../charts/BandSwatch";
import { useWhatIfFormat } from "./useWhatIfFormat";

const ACCOUNT_FIELDS = "myData.steps.pensionSavings";
const isolate = (text: string) => `\u2066${text}\u2069`;

/** The names a source goes by: the fund or policy for an account, the savings pot for an investment. */
function useOriginText() {
  const { t } = useTranslation();

  const category = (origin: Extract<IncomeSourceOrigin, { type: "account" }>) =>
    origin.productCategory ? t(`${ACCOUNT_FIELDS}.options.productCategory.${origin.productCategory}`) : null;

  const name = (origin: IncomeSourceOrigin): string => {
    switch (origin.type) {
      case "account":
        return origin.providerName || category(origin) || t(`${ACCOUNT_FIELDS}.untitledAccount`);
      case "bituachLeumi":
        return t("whatIf.sources.origin.bituachLeumi");
      case "spouseSupplement":
        return t("whatIf.sources.origin.spouseSupplement");
      case "otherAssets":
        return t("whatIf.sources.origin.otherAssets");
      case "bankDeposit":
        return origin.bankName
          ? t("whatIf.sources.origin.bankDeposit", { bank: origin.bankName })
          : t("whatIf.sources.origin.bankDepositUnnamed");
      case "holding":
        if (origin.company && origin.ticker) {
          return t("whatIf.sources.origin.holding", { company: origin.company, ticker: origin.ticker });
        }
        return origin.company || origin.ticker || t("whatIf.sources.origin.holdingUnnamed");
      case "employerShares":
        return t(`whatIf.sources.origin.employerShares.${origin.route}`);
    }
  };

  /** What tells two accounts of one provider apart. */
  const references = (origin: IncomeSourceOrigin): string[] => {
    if (origin.type !== "account") return [];
    return [
      origin.providerName ? category(origin) : null,
      origin.policyNumber ? t(`${ACCOUNT_FIELDS}.policyNumberShort`, { value: origin.policyNumber }) : null,
      origin.fundId ? t(`${ACCOUNT_FIELDS}.fundIdShort`, { value: origin.fundId }) : null,
    ].filter((part): part is string => Boolean(part));
  };

  return { name, references };
}

interface RowProps {
  line: IncomeSourceLine;
  couple: boolean;
  bandLabel: string;
}

function SourceRow({ line, couple, bandLabel }: RowProps) {
  const { t } = useTranslation();
  const { money } = useWhatIfFormat();
  const { name, references } = useOriginText();
  const details = [
    ...references(line.origin),
    ...(couple ? [t(`whatIf.sources.owner.${line.owner}`)] : []),
    ...(line.balance === null ? [] : [t("whatIf.sources.balance", { amount: isolate(money(line.balance)) })]),
  ];

  return (
    <li className="flex items-start gap-3 py-2">
      <span className="mt-1.5">
        <BandSwatch band={line.band} hatched={line.mode === "withdrawal"} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-900">
          <span className="sr-only">{bandLabel}: </span>
          {name(line.origin)}
        </span>
        {details.length > 0 && <span className="block text-xs text-slate-500">{details.join(" · ")}</span>}
      </span>
      <span className="shrink-0 text-sm font-medium tabular-nums text-slate-900">{isolate(money(line.monthly))}</span>
    </li>
  );
}

function IdleRow({ source, couple, bandLabel }: { source: IdleSource; couple: boolean; bandLabel: string }) {
  const { t } = useTranslation();
  const { money } = useWhatIfFormat();
  const { name, references } = useOriginText();
  const details = [
    ...references(source.origin),
    ...(couple ? [t(`whatIf.sources.owner.${source.owner}`)] : []),
    ...(source.balance === null ? [] : [t("whatIf.sources.idle.balance", { amount: isolate(money(source.balance)) })]),
  ];
  const reason =
    source.reason.type === "notDrawn"
      ? t("whatIf.sources.idle.notDrawn")
      : t(`whatIf.sources.idle.${source.reason.type}`, { age: isolate(String(source.reason.age)) });

  return (
    <li className="flex items-start gap-3 py-2">
      <span className="mt-1.5 opacity-50">
        <BandSwatch band={source.band} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-slate-700">
          <span className="sr-only">{bandLabel}: </span>
          {name(source.origin)}
        </span>
        {details.length > 0 && <span className="block text-xs text-slate-500">{details.join(" · ")}</span>}
      </span>
      <span className="max-w-[45%] shrink-0 text-end text-xs text-slate-600">{reason}</span>
    </li>
  );
}

function Group({
  title,
  lines,
  couple,
  bandLabels,
}: {
  title: string;
  lines: IncomeSourceLine[];
  couple: boolean;
  bandLabels: Record<IncomeBandKey, string>;
}) {
  const { money } = useWhatIfFormat();
  const subtotal = lines.reduce((sum, line) => sum + line.monthly, 0);
  return (
    <section>
      <h5 className="flex items-baseline justify-between gap-3 border-b border-slate-200 pb-1 text-xs font-semibold text-slate-600">
        <span>{title}</span>
        <span className="tabular-nums">{isolate(money(subtotal))}</span>
      </h5>
      <ul className="divide-y divide-slate-100">
        {lines.map((line) => (
          <SourceRow key={line.key} line={line} couple={couple} bandLabel={bandLabels[line.band]} />
        ))}
      </ul>
    </section>
  );
}

function YearDetail({ year, bandLabels }: { year: IncomeYearDetail; bandLabels: Record<IncomeBandKey, string> }) {
  const { t } = useTranslation();
  const { money } = useWhatIfFormat();
  const couple = year.spouseAge !== null;
  const payments = year.lines.filter((line) => line.mode === "payment");
  const withdrawals = year.lines.filter((line) => line.mode === "withdrawal");
  const unfunded = year.unfunded !== null && year.unfunded > 0 ? year.unfunded : null;

  return (
    <div className="flex flex-col gap-4">
      {year.lines.length === 0 ? (
        <p className="text-sm text-slate-600">{t("whatIf.sources.empty")}</p>
      ) : (
        <>
          {payments.length > 0 && (
            <Group title={t("projections.split.payments")} lines={payments} couple={couple} bandLabels={bandLabels} />
          )}
          {withdrawals.length > 0 && (
            <Group title={t("projections.split.withdrawals")} lines={withdrawals} couple={couple} bandLabels={bandLabels} />
          )}
        </>
      )}

      <dl className="flex flex-col gap-1 border-t border-slate-300 pt-2 text-sm">
        <div className="flex items-baseline justify-between gap-3 font-semibold text-slate-900">
          <dt>{t("whatIf.sources.total")}</dt>
          <dd className="tabular-nums">{isolate(money(year.total))}</dd>
        </div>
        {unfunded !== null && (
          <div className="flex items-baseline justify-between gap-3 text-amber-800">
            <dt>{t("whatIf.sources.unfunded")}</dt>
            <dd className="tabular-nums">{isolate(money(unfunded))}</dd>
          </div>
        )}
      </dl>

      {year.idle.length > 0 && (
        <section>
          <h5 className="border-b border-slate-200 pb-1 text-xs font-semibold text-slate-600">
            {t("whatIf.sources.idle.title")}
          </h5>
          <ul className="divide-y divide-slate-100">
            {year.idle.map((source) => (
              <IdleRow key={source.key} source={source} couple={couple} bandLabel={bandLabels[source.band]} />
            ))}
          </ul>
        </section>
      )}

      {withdrawals.length > 0 && <p className="text-xs text-slate-500">{t("whatIf.sources.note")}</p>}
    </div>
  );
}

interface WhatIfYearSourcesProps {
  draft: ProfileData;
  basis: IncomeBasis;
  bandLabels: Record<IncomeBandKey, string>;
}

/**
 * A collapsed view under the income chart: pick one year and see which fund, policy or saving pays
 * each part of that year's bar. The lines add up to the bar. It runs only while it is open.
 */
export function WhatIfYearSources({ draft, basis, bandLabels }: WhatIfYearSourcesProps) {
  const { t } = useTranslation();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [chosenAge, setChosenAge] = useState<number | null>(null);

  const years = useMemo(() => (open ? incomeYearDetails(draft, basis) : []), [open, draft, basis]);
  const index = Math.max(
    0,
    years.findIndex((year) => year.age === chosenAge),
  );
  const year: IncomeYearDetail | undefined = years[index];
  const select = (next: number) => setChosenAge(years[next]?.age ?? null);

  return (
    <div className="mt-4 border-t border-slate-200 pt-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-2 text-sm font-semibold text-brand-700 hover:text-brand-800"
      >
        <span aria-hidden="true" className={clsx("inline-block transition-transform", open && "rotate-90 rtl:-rotate-90")}>
          <span className="inline-block rtl:rotate-180">{"\u25b8"}</span>
        </span>
        {t("whatIf.sources.toggle")}
      </button>

      {open && (
        <div id={`${id}-panel`} className="mt-3 flex flex-col gap-4">
          <p className="text-xs text-slate-500">{t("whatIf.sources.intro")}</p>

          {year && (
            <>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1 sm:max-w-xs">
                  <label htmlFor={`${id}-year`} className="text-sm font-medium text-slate-700">
                    {t("whatIf.sources.year")}
                  </label>
                  <select
                    id={`${id}-year`}
                    value={year.age}
                    onChange={(event) => setChosenAge(Number(event.target.value))}
                    className="field-control mt-1 h-11 w-full px-3"
                  >
                    {years.map((option) => (
                      <option key={option.age} value={option.age}>
                        {option.spouseAge === null
                          ? t("whatIf.sources.yearOption", { age: option.age })
                          : t("whatIf.sources.yearOptionCouple", { age: option.age, spouseAge: option.spouseAge })}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary h-11"
                  aria-label={t("whatIf.sources.previous")}
                  disabled={index === 0}
                  onClick={() => select(index - 1)}
                >
                  <span aria-hidden="true">{"\u2039"}</span>
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary h-11"
                  aria-label={t("whatIf.sources.next")}
                  disabled={index === years.length - 1}
                  onClick={() => select(index + 1)}
                >
                  <span aria-hidden="true">{"\u203a"}</span>
                </button>
              </div>

              <h4 className="text-sm font-semibold text-slate-900">
                {year.spouseAge === null
                  ? t("whatIf.sources.heading", { age: isolate(String(year.age)) })
                  : t("whatIf.sources.headingCouple", {
                      age: isolate(String(year.age)),
                      spouseAge: isolate(String(year.spouseAge)),
                    })}
              </h4>
              <YearDetail year={year} bandLabels={bandLabels} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
