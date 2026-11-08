import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { MONTE_CARLO_CONFIDENCE, type ConfidentRetirementAge, type RetirementFeasibility } from "../domain";

interface FeasibilityCardProps {
  feasibility: RetirementFeasibility;
  maxSearchAge: number;
  /** The earliest age that also holds in the share of simulated markets the risk analysis asks for. */
  confidentAge?: ConfidentRetirementAge | null;
  /** True while that age is still being calculated. */
  confidentAgePending?: boolean;
}

export function FeasibilityCard({
  feasibility,
  maxSearchAge,
  confidentAge = null,
  confidentAgePending = false,
}: FeasibilityCardProps) {
  const { t } = useTranslation();
  const { status, earliestAge, yearsFromNow, spouseAge } = feasibility;
  const yearsLabel = yearsFromNow === null ? null : Math.round(yearsFromNow);
  const percent = Math.round(MONTE_CARLO_CONFIDENCE * 100);

  return (
    <section
      aria-labelledby="feasibility-title"
      className="card"
    >
      <h2 id="feasibility-title" className="text-base font-semibold text-slate-900">
        {t("dashboard.feasibility.title")}
      </h2>

      {status === "feasible" && earliestAge !== null && yearsLabel !== null && (
        <div className="mt-2 flex flex-col gap-1">
          <p className="text-2xl font-semibold tabular-nums text-slate-900">
            {t("dashboard.feasibility.earliestAge", { age: earliestAge })}
          </p>
          <p className="text-sm text-slate-600">
            {yearsLabel === 0
              ? t("dashboard.feasibility.feasibleNow")
              : t("dashboard.feasibility.yearsFromNow", { years: yearsLabel })}
          </p>
          <p className="text-sm text-slate-600">{t("dashboard.feasibility.averageMarkets")}</p>
          {spouseAge !== undefined && (
            <p className="text-sm text-slate-600">
              {t("dashboard.feasibility.bothRetire", { age: earliestAge, spouseAge })}
            </p>
          )}
          {confidentAgePending && (
            <p className="text-sm text-slate-500">{t("dashboard.feasibility.confidentPending", { percent })}</p>
          )}
          {confidentAge && (
            <p className="text-sm font-medium text-slate-800">
              {confidentAge.status === "none"
                ? t("dashboard.feasibility.confidentNone", { percent, age: maxSearchAge })
                : confidentAge.age === earliestAge
                  ? t("dashboard.feasibility.confidentSame", { percent })
                  : t("dashboard.feasibility.confidentAge", { percent, age: confidentAge.age })}
            </p>
          )}
        </div>
      )}

      {status === "notFeasible" && (
        <p className="mt-2 text-sm text-amber-800">
          {t("dashboard.feasibility.notFeasible", { age: maxSearchAge })}
        </p>
      )}

      {status === "noTarget" && (
        <p className="mt-2 text-sm text-slate-600">
          {t("dashboard.feasibility.noTarget")}{" "}
          <Link
            to="/my-data/expenses"
            className="font-medium text-brand-700 hover:underline"
          >
            {t("dashboard.feasibility.noTargetCta")}
          </Link>
        </p>
      )}
    </section>
  );
}
