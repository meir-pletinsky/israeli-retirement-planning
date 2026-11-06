import { useTranslation } from "react-i18next";

import { MAX_PLANNING_AGE, type SpendingFunding } from "../domain";

const isolate = (text: string) => `\u2066${text}\u2069`;

function useSpendingText(funding: SpendingFunding) {
  const { t } = useTranslation();
  const amount = isolate(`${t("common.currencySymbol")}${Math.round(funding.monthlySpending).toLocaleString()}`);
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
              ? t("projections.basis.netWorthFunded", { age: MAX_PLANNING_AGE })
              : t("projections.basis.netWorthShortfall", { age }),
          ].join(" ")}
    </p>
  );
}

/**
 * Says what the income charts and the timeline show: the monthly income the savings are
 * estimated to sustain to the horizon, not the planned spending. When the planned spending would
 * exhaust the savings sooner, says so, so the later years are not read as payments that continue.
 */
export function IncomeBasisNote({ funding }: { funding: SpendingFunding }) {
  const { t, amount, age } = useSpendingText(funding);
  return (
    <div className="mt-1 flex flex-col gap-1 text-xs text-slate-500">
      <p>{t("projections.basis.income", { age: MAX_PLANNING_AGE })}</p>
      {age !== null && <p>{t("projections.basis.incomeShortfall", { amount, age })}</p>}
    </div>
  );
}
