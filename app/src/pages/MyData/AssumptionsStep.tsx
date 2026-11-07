import clsx from "clsx";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { useProfile } from "../../app/ProfileContext";
import { NumberField } from "../../components/fields/NumberField";
import { matchingPreset, realAnnualReturnRate } from "../../domain/profileBasics";
import {
  ASSUMPTION_PRESET_KEYS,
  ASSUMPTION_PRESETS,
  MAX_VOLATILITY_PCT,
  PLANNING_HORIZON_AGES,
  type AssumptionPreset,
} from "../../types";
import { StepFooter } from "./StepFooter";
import { InflationReference } from "./InflationReference";
import { formatPercent } from "./summaryFormat";

/** Keeps digits reading left to right when inserted into a right-to-left sentence. */
const isolate = (text: string) => `\u2066${text}\u2069`;

export function AssumptionsStep() {
  const { t } = useTranslation();
  const { profile, updateProfile } = useProfile();
  const { assumptions } = profile;
  const [showAdvanced, setShowAdvanced] = useState(false);
  const idPrefix = useId();
  const current = matchingPreset(assumptions);
  // "Custom" is only offered while the values do not match a preset; it opens the fields to edit.
  const options: Array<AssumptionPreset | "custom"> =
    current === "custom" ? [...ASSUMPTION_PRESET_KEYS, "custom"] : [...ASSUMPTION_PRESET_KEYS];

  function selectPreset(preset: AssumptionPreset) {
    updateProfile({ assumptions: { ...assumptions, preset, ...ASSUMPTION_PRESETS[preset] } });
  }

  function valuesOf(option: AssumptionPreset | "custom") {
    const { investmentReturnPct, inflationPct } =
      option === "custom" ? assumptions : ASSUMPTION_PRESETS[option];
    return {
      investmentReturnPct,
      inflationPct,
      realReturnPct: realAnnualReturnRate({ ...assumptions, investmentReturnPct, inflationPct }) * 100,
    };
  }

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <div>
        <span className="text-sm font-medium text-slate-700">
          {t("myData.steps.assumptions.preset")}
        </span>
        <div className="mt-2 flex flex-wrap gap-2">
          {options.map((option) => {
            const selected = current === option;
            const values = valuesOf(option);
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                aria-labelledby={`${idPrefix}-${option}-name`}
                aria-describedby={`${idPrefix}-${option}-values`}
                onClick={() => (option === "custom" ? setShowAdvanced(true) : selectPreset(option))}
                className={clsx(
                  "min-w-[9rem] max-w-full flex-1 rounded-lg border px-3 py-2 text-start",
                  selected
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100",
                )}
              >
                <span id={`${idPrefix}-${option}-name`} className="block text-sm font-semibold">
                  {t(`myData.steps.assumptions.${option}`)}
                </span>
                <span
                  id={`${idPrefix}-${option}-values`}
                  className={clsx("mt-1 block text-xs", selected ? "text-white/90" : "text-slate-500")}
                >
                  <span className="block">
                    {t("myData.steps.assumptions.presetReturn", {
                      value: isolate(formatPercent(values.investmentReturnPct)),
                    })}
                  </span>
                  <span className="block">
                    {t("myData.steps.assumptions.presetInflation", {
                      value: isolate(formatPercent(values.inflationPct)),
                    })}
                  </span>
                  <span className="block">
                    {t("myData.steps.assumptions.presetRealReturn", {
                      value: isolate(formatPercent(Math.round(values.realReturnPct * 10) / 10)),
                    })}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">{t("myData.steps.assumptions.basisNote")}</p>
        <p className="mt-1 text-xs text-slate-500">
          {t("myData.steps.assumptions.volatilityNote", {
            value: isolate(formatPercent(assumptions.volatilityPct)),
          })}
        </p>
      </div>

      <div>
        <span id={`${idPrefix}-horizon-label`} className="text-sm font-medium text-slate-700">
          {t("myData.steps.assumptions.horizon")}
        </span>
        <div role="group" aria-labelledby={`${idPrefix}-horizon-label`} className="mt-2 flex flex-wrap gap-2">
          {PLANNING_HORIZON_AGES.map((age) => (
            <button
              key={age}
              type="button"
              aria-pressed={assumptions.planningHorizonAge === age}
              onClick={() => updateProfile({ assumptions: { ...assumptions, planningHorizonAge: age } })}
              className={clsx(
                "min-w-[5rem] rounded-lg border px-3 py-2 text-sm font-semibold",
                assumptions.planningHorizonAge === age
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100",
              )}
            >
              {t("myData.steps.assumptions.horizonOption", { age: isolate(String(age)) })}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">{t("myData.steps.assumptions.horizonNote")}</p>
      </div>

      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        className="self-start text-xs font-medium text-brand-700 hover:underline"
      >
        {t("myData.steps.assumptions.advanced")}
      </button>

      {showAdvanced && (
        <div className="flex flex-col gap-4 rounded-md border border-slate-200 p-4">
          <NumberField
            label={t("myData.steps.assumptions.investmentReturn")}
            value={assumptions.investmentReturnPct}
            onChange={(v) =>
              updateProfile({
                assumptions: { ...assumptions, investmentReturnPct: v ?? 0 },
              })
            }
            suffix="%"
          />
          <NumberField
            label={t("myData.steps.assumptions.inflation")}
            value={assumptions.inflationPct}
            onChange={(v) =>
              updateProfile({
                assumptions: { ...assumptions, inflationPct: v ?? 0 },
              })
            }
            suffix="%"
          />
          <InflationReference />
          <NumberField
            label={t("myData.steps.assumptions.volatility")}
            helperText={t("myData.steps.assumptions.volatilityHelp")}
            value={assumptions.volatilityPct}
            min={0}
            max={MAX_VOLATILITY_PCT}
            onChange={(v) =>
              updateProfile({
                assumptions: { ...assumptions, volatilityPct: v ?? 0 },
              })
            }
            suffix="%"
          />
        </div>
      )}

      <StepFooter currentKey="assumptions" />
    </div>
  );
}
