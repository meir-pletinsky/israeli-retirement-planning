import { useTranslation } from "react-i18next";

import type { SpendingFunding } from "../domain";
import { formatNumber } from "../i18n/formatters";

const isolate = (text: string) => `\u2066${text}\u2069`;

function useSpendingText(funding: SpendingFunding) {
  const { t } = useTranslation();
  const amount = isolate(`${t("common.currencySymbol")}${formatNumber(Math.round(funding.monthlySpending))}`);
  const age = funding.shortfallAge === null ? null : isolate(String(funding.shortfallAge));
  return { t, amount, age };
}

/**
 * Says what the net-worth line is: the savings path while the planned spending is drawn, which
 * can run out before the planning horizon, unlike the income charts that are sized to last to it.
 */
export function NetWorthBasisNote({ funding }: { funding: SpendingFunding }) {
  const { t, amount, age } = useSpendingText(funding);
  return (
    <p className="mb-2 text-xs text-slate-500">
      {funding.monthlySpending <= 0
        ? t("projections.basis.netWorthNoSpending")
        : [
            t("projections.basis.netWorth", { amount }),
            age === null
              ? t("projections.basis.netWorthFunded", { age: funding.horizonAge })
              : t("projections.basis.netWorthShortfall", { age }),
          ].join(" ")}
    </p>
  );
}

/**
 * Says what the income charts and the timeline show: the monthly income the savings are
 * estimated to sustain to the horizon, not the planned spending. When the planned spending would
 * exhaust the savings sooner, says so, so the later years are not read as payments that continue.
 * `continuingMonthly` is what the lifelong payments still pay at the horizon, which goes on after it.
 */
export function IncomeBasisNote({
  funding,
  continuingMonthly = 0,
}: {
  funding: SpendingFunding;
  continuingMonthly?: number;
}) {
  const { t, amount, age } = useSpendingText(funding);
  return (
    <div className="mt-1 flex flex-col gap-1 text-xs text-slate-500">
      <p>{t("projections.basis.income", { age: funding.horizonAge })}</p>
      {continuingMonthly >= 1 && (
        <p>
          {t("projections.basis.continues", {
            age: funding.horizonAge,
            amount: isolate(`${t("common.currencySymbol")}${formatNumber(Math.round(continuingMonthly))}`),
          })}
        </p>
      )}
      {age !== null && <p>{t("projections.basis.incomeShortfall", { amount, age })}</p>}
    </div>
  );
}

/**
 * How long the savings last at the planned spending, for the screens that lead with the
 * sustainable income: the two answers differ whenever the plan asks for more than the savings
 * can pay to the horizon. Nothing when no spending is entered.
 */
export function PlannedSpendingLine({ funding }: { funding: SpendingFunding }) {
  const { t, amount, age } = useSpendingText(funding);
  if (funding.monthlySpending <= 0) return null;
  return (
    <p>
      {age === null
        ? t("dashboard.kpi.incomePlanFunded", { amount, age: funding.horizonAge })
        : t("dashboard.kpi.incomePlanShortfall", { amount, age })}
    </p>
  );
}
