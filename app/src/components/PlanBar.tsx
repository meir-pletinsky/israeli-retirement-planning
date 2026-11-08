import clsx from "clsx";
import { useTranslation } from "react-i18next";

import { MIN_RETIREMENT_AGE, resolveRetirementAge, type SpendingFunding } from "../domain";
import { formatNumber } from "../i18n/formatters";
import type { ProfileData, RetirementScenario } from "../types";
import { sectionAnchor, type ProjectionSection } from "./projectionSections";
import { useFormatAge } from "./useFormatAge";
import { useScenarioLabel } from "./useScenarioLabel";

const SCENARIOS: RetirementScenario[] = ["early", "standard", "delayed"];

const isolate = (text: string) => `\u2066${text}\u2069`;

interface Props {
  profile: ProfileData;
  scenario: RetirementScenario;
  onScenarioChange: (scenario: RetirementScenario) => void;
  funding: SpendingFunding;
  isCouple: boolean;
  /** The page's groups that have content, in page order: one link each in the section index. */
  sections: ProjectionSection[];
}

/**
 * The scenario choice with the figures it drives, and an index of the page's sections, kept in
 * view while the page scrolls so the numbers in a chart far down the page are never separated
 * from the scenario they belong to. It is a direct child of the tall page container, which is
 * what lets it stay stuck.
 */
export function PlanBar({ profile, scenario, onScenarioChange, funding, isCouple, sections }: Props) {
  const { t } = useTranslation();
  const formatAge = useFormatAge();
  const scenarioLabel = useScenarioLabel(profile);
  const earlyAtStandard =
    resolveRetirementAge(profile, "early") === resolveRetirementAge(profile, "standard");
  const hasSpending = funding.monthlySpending > 0;
  const amount = isolate(`${t("common.currencySymbol")}${formatNumber(Math.round(funding.monthlySpending))}`);

  return (
    <>
      <section
        aria-labelledby="scenario-title"
        data-sticky-bar
        className="z-30 rounded-[var(--radius-card)] border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur md:sticky md:top-0"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 id="scenario-title" className="text-base font-semibold text-slate-900">
            {t("projections.scenario")}
          </h2>
          <div role="group" aria-labelledby="scenario-title" className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 ring-1 ring-slate-400">
            {SCENARIOS.map((s) => {
              const duplicate = s === "early" && earlyAtStandard;
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={scenario === s}
                  disabled={duplicate}
                  onClick={() => onScenarioChange(s)}
                  className={clsx(
                    "min-h-10 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors",
                    scenario === s ? "bg-white font-semibold text-brand-800 shadow-sm ring-1 ring-slate-400" : "text-slate-600 hover:text-slate-900",
                    duplicate && "cursor-not-allowed opacity-50",
                  )}
                >
                  {scenarioLabel(s)}
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <ul
            aria-label={t("projections.planBar.facts")}
            className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600"
          >
            <li>
              {t("projections.planBar.retireAt", {
                age: isolate(formatAge(resolveRetirementAge(profile, scenario))),
              })}
            </li>
            {hasSpending && <li>{t("projections.planBar.planned", { amount })}</li>}
            {hasSpending && (
              <li
                className={clsx("font-medium", funding.shortfallAge === null ? "text-emerald-700" : "text-amber-700")}
              >
                {funding.shortfallAge === null
                  ? t("projections.planBar.fundedTo", { age: isolate(String(funding.horizonAge)) })
                  : t("projections.planBar.runsOutAt", { age: isolate(String(funding.shortfallAge)) })}
              </li>
            )}
          </ul>
          <nav aria-label={t("projections.sections.nav")} className="max-w-full">
            <ul className="flex flex-wrap gap-1 md:flex-nowrap md:overflow-x-auto">
              {sections.map((section) => (
                <li key={section}>
                  <a
                    href={`#${sectionAnchor(section)}`}
                    className="block whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium text-brand-700 underline decoration-brand-600 underline-offset-4 hover:bg-brand-50"
                  >
                    {t(`projections.sections.${section}.title`)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </section>

      <div className="-mt-3 flex flex-col gap-1 px-1 text-xs text-slate-500">
        <p>{t("projections.scenarioScope")}</p>
        {earlyAtStandard && <p>{t("projections.scenarioEarlyFloor", { age: MIN_RETIREMENT_AGE })}</p>}
        {isCouple && <p>{t("projections.householdNote")}</p>}
      </div>
    </>
  );
}
