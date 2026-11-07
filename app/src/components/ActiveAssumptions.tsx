import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useProfile } from "../app/ProfileContext";
import { formatDate } from "../i18n/formatters";
import { matchingPreset } from "../domain/profileBasics";
import { formatPercent } from "../pages/MyData/summaryFormat";
import type { Assumptions } from "../types";

interface ActiveAssumptionsProps {
  assumptions: Assumptions;
}

/** Keeps digits reading left to right when inserted into a right-to-left sentence. */
const isolate = (text: string) => `\u2066${text}\u2069`;

const localIsoDate = (date: Date) =>
  [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0"))
    .join("-");

/** One line on a results page naming the assumptions every figure on it rests on, and the day they were calculated. */
export function ActiveAssumptions({ assumptions }: ActiveAssumptionsProps) {
  const { t } = useTranslation();
  const { evaluatedAt } = useProfile();

  return (
    <div
      role="note"
      aria-label={t("assumptionsSummary.label")}
      className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600"
    >
      <span className="font-semibold text-slate-800">
        {t(`myData.steps.assumptions.${matchingPreset(assumptions)}`)}
      </span>
      <span>
        {t("assumptionsSummary.values", {
          returnPct: isolate(formatPercent(assumptions.investmentReturnPct)),
          inflation: isolate(formatPercent(assumptions.inflationPct)),
          volatility: isolate(formatPercent(assumptions.volatilityPct)),
        })}
      </span>
      <span>
        {t("assumptionsSummary.horizon", { age: isolate(String(assumptions.planningHorizonAge)) })}
      </span>
      <span>
        {t("assumptionsSummary.calculatedOn", {
          date: isolate(formatDate(localIsoDate(evaluatedAt))),
        })}
      </span>
      <Link to="/my-data/assumptions" className="font-medium text-brand-700 hover:underline">
        {t("assumptionsSummary.change")}
      </Link>
    </div>
  );
}
