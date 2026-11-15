import clsx from "clsx";
import { useDeferredValue, useEffect, useMemo, useState, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";

import { useProfile } from "../../app/ProfileContext";
import { useHeavyResult } from "../../app/useHeavyResult";
import { useWhatIfDraft } from "../../app/whatIfDraft";
import {
  PLAN_KEYS,
  WHAT_IF_BASES,
  type AgeGridColumn,
  type IncomeBandKey,
  type PensionStartKey,
  type WhatIfBasis,
  type WhatIfOverrides,
  type WhatIfSliderKey,
  type WhatIfValues,
  ageGridColumns,
  applyWhatIf,
  baselineWhatIf,
  buildAgeGrid,
  canChoosePensionStart,
  desiredRetirementMonthly,
  effectivePensionStartAge,
  evaluateWhatIf,
  hasDollarHoldings,
  incomeSurplus,
  pensionStartOf,
  sameWhatIfValue,
  successPercent,
  whatIfNotes,
  whatIfPlanPatch,
  whatIfRanges,
  whatIfSensitivity,
  whatIfValues,
} from "../../domain";
import { PLANNING_HORIZON_AGES, WITHDRAWAL_STRATEGIES } from "../../types";
import { ChartFrame } from "../charts/ChartFrame";
import { IncomeBreakdownTable } from "../charts/ChartTables";
import { useChartTakeaways } from "../charts/chartTakeaways";
import { IncomeBreakdownChart } from "../charts/IncomeBreakdownChart";
import { WhatIfAgeGrid } from "./WhatIfAgeGrid";
import { WhatIfSensitivity } from "./WhatIfSensitivity";
import { WhatIfSlider } from "./WhatIfSlider";
import { WhatIfSummary } from "./WhatIfSummary";
import { WhatIfYearSources } from "./WhatIfYearSources";
import { WithdrawalMixControl } from "./WithdrawalMixControl";
import { useWhatIfFormat } from "./useWhatIfFormat";

const RISK_DELAY_MS = 400;
const isolate = (text: string) => `\u2066${text}\u2069`;

/** A value that follows `value` after it has held still for `delay`, so a drag does not start a simulation per step. */
function useSettled<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

interface WhatIfPanelProps {
  bandLabels: Record<IncomeBandKey, string>;
}

/**
 * Sliders over a draft of the plan, and what the draft does to monthly income year by year. The
 * draft lives here; the saved plan changes only when "Apply to my plan" is pressed.
 */
export function WhatIfPanel({ bandLabels }: WhatIfPanelProps) {
  const { t } = useTranslation();
  const { profile, updateProfile } = useProfile();
  const { draft: savedDraft, setDraft } = useWhatIfDraft();
  const format = useWhatIfFormat();
  const takeaways = useChartTakeaways();
  const currencySymbol = t("common.currencySymbol");

  const { overrides, basis: chosenBasis, column: chosenColumn } = savedDraft;
  const setOverrides = (next: SetStateAction<WhatIfOverrides>) =>
    setDraft((current) => ({
      ...current,
      overrides: typeof next === "function" ? next(current.overrides) : next,
    }));
  const setBasis = (basis: WhatIfBasis) => setDraft((current) => ({ ...current, basis }));
  const setColumn = (column: AgeGridColumn) => setDraft((current) => ({ ...current, column }));
  const [applied, setApplied] = useState(false);

  const baseline = useMemo(() => baselineWhatIf(profile), [profile]);
  const values = useMemo(() => whatIfValues(profile, overrides), [profile, overrides]);
  const ranges = useMemo(() => whatIfRanges(profile, values), [profile, values]);
  const pensionChoice = useMemo(
    () => ({ pensionStartAge: canChoosePensionStart(profile, "self"), spousePensionStartAge: canChoosePensionStart(profile, "spouse") }),
    [profile],
  );

  // The sliders answer at once; the charts, the grid and the simulation follow when the page is free.
  const deferredOverrides = useDeferredValue(overrides);
  const shown = useMemo(() => whatIfValues(profile, deferredOverrides), [profile, deferredOverrides]);
  const draft = useMemo(() => applyWhatIf(profile, shown), [profile, shown]);
  const changed = draft !== profile;
  const updating = deferredOverrides !== overrides;

  const draftOutcome = useMemo(() => evaluateWhatIf(draft), [draft]);
  const planOutcome = useMemo(() => evaluateWhatIf(profile), [profile]);
  const sensitivity = useMemo(() => whatIfSensitivity(profile, shown), [profile, shown]);
  const gridColumns = useMemo(() => ageGridColumns(profile), [profile]);
  const gridColumn = gridColumns.includes(chosenColumn) ? chosenColumn : gridColumns[0];
  const grid = useMemo(() => buildAgeGrid(profile, shown, gridColumn), [profile, shown, gridColumn]);

  const settledDraft = useSettled(draft, RISK_DELAY_MS);
  const riskProfile = draft === profile ? profile : settledDraft;
  // Simulations start only once a slider has moved, so opening the page does not compete with its own risk analysis.
  const riskEnabled = changed && (desiredRetirementMonthly(riskProfile.expenses) ?? 0) > 0;
  const draftRisk = useHeavyResult("dashboardRisk", riskProfile, {}, riskEnabled);
  const planRisk = useHeavyResult("dashboardRisk", profile, {}, riskEnabled && baseline.monthlySpending > 0);
  const draftRiskResult = draftRisk.value ?? draftRisk.stale ?? null;
  const planRiskResult = planRisk.value ?? planRisk.stale ?? null;
  const chance = riskEnabled
    ? {
        draft: draftRiskResult ? successPercent(draftRiskResult.successProbability) : null,
        plan: planRiskResult ? successPercent(planRiskResult.successProbability) : null,
        updating: riskProfile !== draft || draftRisk.pending,
      }
    : null;

  const basis: WhatIfBasis = draftOutcome.cashFlow ? chosenBasis : "sustainable";
  const surplus = useMemo(
    () =>
      basis === "planned" && draftOutcome.cashFlow
        ? incomeSurplus(draftOutcome.cashFlow, draft.assumptions.incomeCapPct)
        : null,
    [basis, draftOutcome.cashFlow, draft.assumptions.incomeCapPct],
  );
  const draftPoints = basis === "planned" && draftOutcome.cashFlow ? draftOutcome.cashFlow.years : draftOutcome.income;
  const planPoints = basis === "planned" ? planOutcome.cashFlow?.years : planOutcome.income;
  const takeaway =
    basis === "planned" && draftOutcome.cashFlow
      ? takeaways.cashFlow(draftOutcome.cashFlow)
      : takeaways.income(draftOutcome.income);
  const chartName = t("whatIf.chart.title");

  const hasOverrides = Object.keys(overrides).length > 0;
  const planChanged = PLAN_KEYS.some((key) => !sameWhatIfValue(key, values, baseline));
  const noteTexts = whatIfNotes(profile, values).map((note) => ({
    slider: note.slider,
    text: t(`whatIf.note.${note.key}`, { age: isolate(String(note.age ?? "")) }),
  }));

  const update = (patch: WhatIfOverrides) => {
    setApplied(false);
    setOverrides((current) => {
      const next: WhatIfOverrides = { ...current, ...patch };
      for (const key of Object.keys(patch) as (keyof WhatIfValues)[]) {
        if (sameWhatIfValue(key, { ...baseline, ...next }, baseline)) delete next[key];
      }
      return next;
    });
  };

  const reset = () => {
    setApplied(false);
    setOverrides({});
  };

  const apply = () => {
    updateProfile(whatIfPlanPatch(profile, values));
    const { sharesChangePct, dollarChangePct } = overrides;
    setOverrides({
      ...(sharesChangePct === undefined ? {} : { sharesChangePct }),
      ...(dollarChangePct === undefined ? {} : { dollarChangePct }),
    });
    setApplied(true);
  };

  const slider = (key: Exclude<WhatIfSliderKey, PensionStartKey>, extraNotes: string[] = []) => {
    const current = values[key];
    const base = baseline[key];
    if (current === null || base === null) return null;
    return (
      <WhatIfSlider
        key={key}
        label={format.label(key)}
        value={current}
        baseline={base}
        range={ranges[key]}
        onChange={(next) => update({ [key]: next })}
        format={(amount) => format.value(key, amount)}
        notes={[...noteTexts.filter((note) => note.slider === key).map((note) => note.text), ...extraNotes]}
      />
    );
  };

  // A start age at the earliest the draft allows is stored as "follow retirement" (null), so the
  // slider's own minimum is the way back to that. The baseline is shown at the draft's retirement
  // age, so a pension that follows retirement never reads as changed.
  const pensionSlider = (key: PensionStartKey) => {
    if (!pensionChoice[key] || (key === "spousePensionStartAge" && values.spouseRetirementAge === null)) return null;
    const retirement = values[key === "pensionStartAge" ? "retirementAge" : "spouseRetirementAge"] ?? 0;
    const range = ranges[key];
    return (
      <WhatIfSlider
        key={key}
        label={format.label(key)}
        value={pensionStartOf(values, key)}
        baseline={effectivePensionStartAge(baseline[key], retirement)}
        range={range}
        onChange={(next) => update({ [key]: next <= range.min ? null : next })}
        format={(amount) => format.value(key, amount)}
        notes={noteTexts.filter((note) => note.slider === key).map((note) => note.text)}
      />
    );
  };

  const showMarkets = hasDollarHoldings(profile);

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
      <div className="card flex flex-col gap-5 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
        <p className="text-xs text-slate-500">{t("whatIf.intro")}</p>

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-2 text-sm font-semibold text-slate-900">{t("whatIf.group.ages")}</legend>
          {slider("retirementAge")}
          {slider("spouseRetirementAge")}
          {pensionSlider("pensionStartAge")}
          {pensionSlider("spousePensionStartAge")}
        </fieldset>

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-2 text-sm font-semibold text-slate-900">{t("whatIf.group.markets")}</legend>
          {slider("investmentReturnPct")}
          {slider("inflationPct")}
          {showMarkets && slider("sharesChangePct")}
          {showMarkets && slider("dollarChangePct")}
        </fieldset>

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-2 text-sm font-semibold text-slate-900">{t("whatIf.group.spending")}</legend>
          {slider("monthlySpending")}
          {values.monthlySpending > 0 && slider("incomeCapPct", [t("whatIf.note.incomeCap")])}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold text-slate-900">{t("whatIf.group.withdrawals")}</legend>
          <p className="text-xs text-slate-500">{t("whatIf.withdrawals.intro")}</p>
          {WITHDRAWAL_STRATEGIES.map((strategy) => (
            <label key={strategy} className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
              <input
                type="radio"
                name="whatif-withdrawal-strategy"
                checked={values.withdrawalStrategy === strategy}
                onChange={() => update({ withdrawalStrategy: strategy })}
                className="accent-brand-600"
              />
              <span className={clsx(values.withdrawalStrategy === strategy && "font-semibold")}>
                {t(`projections.withdrawal.strategy.${strategy}.name`)}
              </span>
            </label>
          ))}
          <p className="text-xs text-slate-600">
            {t(`projections.withdrawal.strategy.${values.withdrawalStrategy}.description`)}
          </p>
          {values.withdrawalStrategy !== baseline.withdrawalStrategy && (
            <button
              type="button"
              onClick={() => update({ withdrawalStrategy: baseline.withdrawalStrategy })}
              className="self-start text-xs font-medium text-brand-700 hover:underline"
            >
              {t("whatIf.slider.backToPlan", {
                value: t(`projections.withdrawal.strategy.${baseline.withdrawalStrategy}.name`),
              })}
            </button>
          )}
          {values.withdrawalStrategy === "custom" && (
            <WithdrawalMixControl
              mix={values.withdrawalMix}
              baseline={baseline.withdrawalMix}
              onChange={(withdrawalMix) => update({ withdrawalMix })}
            />
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold text-slate-900">{t("whatIf.param.planningHorizonAge")}</legend>
          <div className="inline-flex flex-wrap gap-1 self-start rounded-2xl bg-slate-100 p-1">
            {PLANNING_HORIZON_AGES.map((age) => (
              <button
                key={age}
                type="button"
                aria-pressed={values.planningHorizonAge === age}
                onClick={() => update({ planningHorizonAge: age })}
                className={clsx(
                  "rounded-full px-3 py-1.5 text-sm font-medium tabular-nums transition-colors",
                  values.planningHorizonAge === age ? "bg-white text-brand-700 shadow" : "text-slate-500",
                )}
              >
                {age}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2 border-t border-slate-200 pt-4">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={reset} disabled={!hasOverrides} className="btn btn-sm btn-secondary">
              {t("whatIf.reset")}
            </button>
            <button type="button" onClick={apply} disabled={!planChanged} className="btn btn-sm btn-primary">
              {t("whatIf.apply")}
            </button>
          </div>
          <p className="text-xs text-slate-500">{t("whatIf.applyHint")}</p>
          <p role="status" className="text-xs font-medium text-emerald-700">
            {applied ? t("whatIf.applied") : ""}
          </p>
        </div>
      </div>

      <div className={clsx("flex min-w-0 flex-col gap-6 transition-opacity", updating && "opacity-60")} aria-busy={updating}>
        <div className="card flex flex-col gap-3">
          <p className="text-sm text-slate-700">{t(changed ? "whatIf.draftNotice" : "whatIf.planNotice")}</p>
          <WhatIfSummary draft={draftOutcome} plan={planOutcome} changed={changed} chance={chance} />
        </div>

        <section aria-labelledby="whatif-chart-title" className="card">
          <h3 id="whatif-chart-title" className="text-base font-semibold text-slate-900">
            {chartName}
          </h3>
          {draftOutcome.cashFlow && (
            <div
              role="group"
              aria-label={t("projections.timeline.basisGroup")}
              className="mt-3 inline-flex flex-wrap gap-1 rounded-2xl bg-slate-100 p-1"
            >
              {WHAT_IF_BASES.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={basis === option}
                  onClick={() => setBasis(option)}
                  className={clsx(
                    "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                    basis === option ? "bg-white text-brand-700 shadow" : "text-slate-500",
                  )}
                >
                  {t(`projections.timeline.basis.${option}`)}
                </button>
              ))}
            </div>
          )}
          <p className="mb-3 mt-2 text-xs text-slate-500">
            {basis === "planned" && draftOutcome.cashFlow
              ? t("whatIf.chart.notePlanned", {
                  amount: isolate(format.money(draftOutcome.cashFlow.monthlySpending)),
                })
              : t("whatIf.chart.noteSustainable")}
          </p>
          {surplus?.peak && (
            <div role="note" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              <p className="font-medium">
                {surplus.years.length === 1
                  ? t("whatIf.surplus.single", {
                      age: isolate(String(surplus.peak.age)),
                      cap: isolate(format.rate(surplus.capPct)),
                      excess: isolate(format.money(surplus.peak.excess)),
                    })
                  : t("whatIf.surplus.range", {
                      from: isolate(String(surplus.years[0].age)),
                      to: isolate(String(surplus.years[surplus.years.length - 1].age)),
                      cap: isolate(format.rate(surplus.capPct)),
                      excess: isolate(format.money(surplus.peak.excess)),
                      age: isolate(String(surplus.peak.age)),
                    })}
              </p>
              <p className="mt-1 text-xs">{t("whatIf.surplus.why")}</p>
            </div>
          )}
          <ChartFrame
            takeaway={takeaway}
            table={<IncomeBreakdownTable points={draftPoints} labels={bandLabels} caption={chartName} />}
          >
            <IncomeBreakdownChart
              name={chartName}
              description={takeaway ?? chartName}
              data={draftPoints}
              currencySymbol={currencySymbol}
              labels={bandLabels}
              texts={{
                payments: t("projections.split.payments"),
                withdrawals: t("projections.split.withdrawals"),
                total: t("projections.split.total"),
                paymentOf: (source) => t("projections.split.paymentOf", { source }),
                withdrawalOf: (source) => t("projections.split.withdrawalOf", { source }),
              }}
              planned={
                basis === "planned" && draftOutcome.cashFlow
                  ? { monthly: draftOutcome.cashFlow.monthlySpending, label: t("projections.cashFlow.plannedLine") }
                  : undefined
              }
              unfundedLabel={basis === "planned" ? t("projections.cashFlow.unfunded") : undefined}
              baseline={changed && planPoints ? { data: planPoints, label: t("whatIf.chart.baseline") } : undefined}
            />
          </ChartFrame>
          <WhatIfYearSources draft={draft} basis={basis} bandLabels={bandLabels} />
        </section>

        <WhatIfSensitivity rows={sensitivity} hasSpending={shown.monthlySpending > 0} />

        <WhatIfAgeGrid
          grid={grid}
          values={shown}
          columns={gridColumns}
          onColumnChange={setColumn}
          onPick={(retirementAge, columnValue) =>
            update({ retirementAge, [grid.column]: columnValue } as WhatIfOverrides)
          }
        />
      </div>
    </div>
  );
}
