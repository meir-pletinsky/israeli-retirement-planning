import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { formatDate as formatIsoDate, type LeavingEarlyCost } from "../domain";
import { ScenarioTitle } from "./ScenarioTag";

interface UnvestedSharesCardProps {
  cost: LeavingEarlyCost | null;
  /** Names the retirement scenario shown, beside the title. */
  scenarioTag?: ReactNode;
}

/** Keeps digits reading left to right when inserted into a right-to-left sentence. */
const isolate = (text: string) => `\u2066${text}\u2069`;

const formatDate = (iso: string) => isolate(formatIsoDate(iso));

/** What leaving before the company shares vest costs, and what waiting for the next batch would earn back. */
export function UnvestedSharesCard({ cost, scenarioTag }: UnvestedSharesCardProps) {
  const { t } = useTranslation();
  const currencySymbol = t("common.currencySymbol");

  if (!cost) {
    return null;
  }

  const money = (amount: number) => isolate(`${currencySymbol}${amount.toLocaleString()}`);
  const shares = (count: number) =>
    t("projections.unvested.sharesCount", { count, amount: isolate(count.toLocaleString()) });

  return (
    <section
      aria-labelledby="unvested-shares-title"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <ScenarioTitle id="unvested-shares-title" tag={scenarioTag}>
        {t("projections.unvested.title")}
      </ScenarioTitle>
      <p className="mt-1 text-xs text-slate-500">{t("projections.unvested.intro")}</p>

      <p role="status" className="mt-3 text-sm text-amber-800">
        {t("projections.unvested.lost", {
          date: formatDate(cost.retirementDate),
          shares: shares(cost.lostShares),
          value: money(cost.lostValue),
        })}
      </p>

      {cost.next && (
        <div className="mt-2 space-y-1 text-sm text-slate-700">
          <p>
            {t("projections.unvested.next", {
              period: t("projections.unvested.monthsCount", {
                count: cost.next.monthsLater,
                amount: isolate(String(cost.next.monthsLater)),
              }),
              date: formatDate(cost.next.vestDate),
              shares: shares(cost.next.shares),
              value: money(cost.next.value),
            })}
          </p>
          {cost.next.monthlyNetGain > 0 && (
            <p>{t("projections.unvested.nextGain", { amount: money(cost.next.monthlyNetGain) })}</p>
          )}
        </div>
      )}

      <details className="mt-3 text-sm text-slate-700">
        <summary className="cursor-pointer text-xs font-medium text-brand-700">
          {t("projections.unvested.howTitle")}
        </summary>
        <ul className="mt-2 list-disc space-y-1 ps-5 text-xs text-slate-600">
          <li>{t("projections.unvested.howRule")}</li>
          <li>{t("projections.unvested.howGain")}</li>
          <li>{t("projections.unvested.howReadOnly")}</li>
        </ul>
      </details>
    </section>
  );
}
