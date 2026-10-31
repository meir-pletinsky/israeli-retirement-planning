import clsx from "clsx";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useProfile } from "../../app/ProfileContext";
import { NumberField } from "../../components/fields/NumberField";
import { ASSUMPTION_PRESETS, MAX_VOLATILITY_PCT, type AssumptionPreset } from "../../types";
import { StepFooter } from "./StepFooter";

const PRESET_KEYS: AssumptionPreset[] = ["conservative", "base", "optimistic"];

export function AssumptionsStep() {
  const { t } = useTranslation();
  const { profile, updateProfile } = useProfile();
  const { assumptions } = profile;
  const [showAdvanced, setShowAdvanced] = useState(false);

  function selectPreset(preset: AssumptionPreset) {
    updateProfile({ assumptions: { ...assumptions, preset, ...ASSUMPTION_PRESETS[preset] } });
  }

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <div>
        <span className="text-sm font-medium text-slate-700">
          {t("myData.steps.assumptions.preset")}
        </span>
        <div className="mt-2 flex gap-2">
          {PRESET_KEYS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => selectPreset(preset)}
              className={clsx(
                "rounded-full px-3 py-1.5 text-sm font-medium",
                assumptions.preset === preset
                  ? "bg-brand-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200",
              )}
            >
              {t(`myData.steps.assumptions.${preset}`)}
            </button>
          ))}
        </div>
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
