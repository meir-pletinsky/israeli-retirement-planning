import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import type { IncomeBandKey, IncomeCompositionStage } from "../domain";
import { formatNumber } from "../i18n/formatters";
import { BandSwatch } from "./charts/BandSwatch";
import { bandFill } from "./charts/incomeBandColors";
import { useFormatAge } from "./useFormatAge";

const BAND_LABEL_KEYS: Record<IncomeBandKey, string> = {
  pensionFund: "projections.sourcePension",
  providentFund: "projections.sourceProvidentFund",
  managersInsurance: "projections.sourceManagersInsurance",
  studyFund: "projections.sourceStudyFund",
  investments: "projections.sourceInvestments",
  bituachLeumi: "projections.sourceBituachLeumi",
};

const STAGE_TITLE_KEYS: Record<IncomeCompositionStage["reason"], string> = {
  retirement: "dashboard.snapshot.income.stageRetirement",
  payments: "dashboard.snapshot.income.stagePayments",
};

const isolate = (text: string) => `\u2066${text}\u2069`;

/**
 * One bar per stage of retirement showing where the monthly income comes from, split into
 * recurring payments (solid) and withdrawals from savings (hatched), in the terms of the
 * Projections timeline it links to. `endAge` is the planning horizon; `continuingMonthly` is what
 * the lifelong payments still pay then, which goes on after it.
 */
export function IncomeComposition({
  stages,
  endAge,
  continuingMonthly = 0,
}: {
  stages: IncomeCompositionStage[];
  endAge: number;
  continuingMonthly?: number;
}) {
  const { t } = useTranslation();
  const formatAge = useFormatAge();
  const currencySymbol = t("common.currencySymbol");
  const money = (amount: number) => `${currencySymbol}${formatNumber(Math.round(amount))}`;
  const hasStateBenefits = stages.some((stage) => stage.parts.some((part) => part.band === "bituachLeumi"));

  return (
    <section
      aria-labelledby="income-composition-title"
      className="@container card"
    >
      <h3 id="income-composition-title" className="text-base font-semibold text-slate-900">
        {t("dashboard.snapshot.income.title")}
      </h3>
      {stages.length === 0 ? (
        <p className="mt-1 text-sm text-slate-600">{t("dashboard.snapshot.income.none")}</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-slate-500">
            {t("dashboard.snapshot.income.intro", { endAge: formatAge(endAge) })}
          </p>
          <div className="mt-3 grid gap-5 @lg:grid-cols-2">
            {stages.map((stage) => (
              <div key={stage.reason}>
                <h4 className="text-sm font-medium text-slate-800">
                  {t(STAGE_TITLE_KEYS[stage.reason], { age: formatAge(stage.age) })}
                </h4>
                <div
                  aria-hidden="true"
                  className="mt-2 flex h-4 overflow-hidden rounded-sm ring-1 ring-slate-200"
                >
                  {stage.parts.map((part) => (
                    <span
                      key={`${part.band}-${part.kind}`}
                      className="block h-full"
                      style={{ flexGrow: part.monthly, flexBasis: 0, ...bandFill(part.band, part.kind === "withdrawal") }}
                    />
                  ))}
                </div>
                <ul className="mt-2 flex flex-col gap-0.5 text-sm">
                  {stage.parts.map((part) => (
                    <li key={`${part.band}-${part.kind}`} className="flex items-center gap-2">
                      <BandSwatch band={part.band} hatched={part.kind === "withdrawal"} />
                      <span>
                        {t(part.kind === "payment" ? "projections.split.paymentOf" : "projections.split.withdrawalOf", {
                          source: t(BAND_LABEL_KEYS[part.band]),
                        })}
                      </span>
                      <span className="ms-auto text-slate-600 tabular-nums">{money(part.monthly)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-sm font-medium text-slate-800">
                  {t("dashboard.snapshot.income.total", { amount: isolate(money(stage.total)) })}
                </p>
              </div>
            ))}
          </div>
          {continuingMonthly >= 1 && (
            <p className="mt-3 text-xs text-slate-500">
              {t("dashboard.snapshot.income.continues", {
                age: formatAge(endAge),
                amount: isolate(money(continuingMonthly)),
              })}
            </p>
          )}
          {!hasStateBenefits && (
            <p className="mt-3 text-xs text-slate-500">{t("dashboard.snapshot.income.noStateBenefits")}</p>
          )}
          <p className="mt-3 text-xs">
            <Link to="/projections#retirement-timeline-title" className="font-medium text-brand-700 hover:underline">
              {t("dashboard.snapshot.income.timelineLink")}
            </Link>
          </p>
        </>
      )}
    </section>
  );
}
