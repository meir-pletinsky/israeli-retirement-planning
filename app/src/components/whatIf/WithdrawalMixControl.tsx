import clsx from "clsx";
import { useTranslation } from "react-i18next";

import { rebalanceWithdrawalMix } from "../../domain";
import { WITHDRAWAL_MIX_KEYS, type WithdrawalMix, type WithdrawalMixKey } from "../../types";
import { WhatIfSlider } from "./WhatIfSlider";

const isolate = (text: string) => `\u2066${text}\u2069`;

const SWATCH: Record<WithdrawalMixKey, string> = {
  studyFund: "bg-emerald-500",
  shares: "bg-sky-500",
  deposits: "bg-amber-500",
};

const RANGE = { min: 0, max: 100, step: 1 };

interface WithdrawalMixControlProps {
  mix: WithdrawalMix;
  /** The saved plan's split, marked on each slider. */
  baseline: WithdrawalMix;
  onChange: (mix: WithdrawalMix) => void;
}

/**
 * Three linked sliders that split each year's withdrawals between the study fund, shares and bank
 * deposits. Moving one rebalances the other two, so the split always adds up to 100%.
 */
export function WithdrawalMixControl({ mix, baseline, onChange }: WithdrawalMixControlProps) {
  const { t } = useTranslation();
  const percent = (value: number) => `${value}%`;
  const summary = WITHDRAWAL_MIX_KEYS.map((key) => `${t(`whatIf.mix.${key}`)} ${percent(mix[key])}`).join(", ");

  return (
    <div className="flex flex-col gap-3">
      <div
        role="img"
        aria-label={summary}
        className="flex h-3 w-full overflow-hidden rounded-full bg-slate-200"
      >
        {WITHDRAWAL_MIX_KEYS.map((key) => (
          <span
            key={key}
            className={clsx("h-full transition-[width]", SWATCH[key])}
            style={{ width: `${mix[key]}%` }}
          />
        ))}
      </div>
      {WITHDRAWAL_MIX_KEYS.map((key) => (
        <div key={key} className="flex items-start gap-2">
          <span aria-hidden="true" className={clsx("mt-1.5 h-3 w-3 shrink-0 rounded-sm", SWATCH[key])} />
          <div className="min-w-0 flex-1">
            <WhatIfSlider
              label={t(`whatIf.mix.${key}`)}
              value={mix[key]}
              baseline={baseline[key]}
              range={RANGE}
              onChange={(next) => onChange(rebalanceWithdrawalMix(mix, key, next))}
              format={percent}
            />
          </div>
        </div>
      ))}
      <p className="text-xs text-slate-500">{t("whatIf.mix.hint", { total: isolate("100%") })}</p>
    </div>
  );
}
