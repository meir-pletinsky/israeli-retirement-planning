import { useTranslation } from "react-i18next";

import type { LeavingEarlyCost } from "../domain";

interface UnvestedSharesCardProps {
  cost: LeavingEarlyCost | null;
}

/** Keeps digits reading left to right when inserted into a right-to-left sentence. */
const isolate = (text: string) => `\u2066${text}\u2069`;

/** ISO date (2026-10-26) to the day-first format used in Israel (26.10.2026). */
const formatDate = (iso: string) => isolate(iso.split("-").reverse().join("."));

/** What leaving before the company shares vest costs, and what waiting for the next batch would earn back. */
export function UnvestedSharesCard({ cost }: UnvestedSharesCardProps) {
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
      <h2 id="unvested-shares-title" className="text-sm font-semibold text-slate-700">
        {t("projections.unvested.title")}
      </h2>
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
