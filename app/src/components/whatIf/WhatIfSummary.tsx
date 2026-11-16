import clsx from "clsx";
import { useTranslation } from "react-i18next";

import type { WhatIfOutcome } from "../../domain";
import { useWhatIfFormat } from "./useWhatIfFormat";

const isolate = (text: string) => `\u2066${text}\u2069`;

type Tone = "better" | "worse" | "same";

const toneOf = (change: number): Tone => (change > 0 ? "better" : change < 0 ? "worse" : "same");

const TONE_CLASS: Record<Tone, string> = {
  better: "text-emerald-700",
  worse: "text-amber-700",
  same: "text-slate-500",
};

interface StatProps {
  label: string;
  value: string;
  /** How the value differs from the saved plan; the sign is written out so colour is never the only cue. */
  change?: { text: string; tone: Tone } | null;
  busy?: boolean;
}

function Stat({ label, value, change, busy }: StatProps) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <dt className="text-xs text-slate-600">{label}</dt>
      <dd className={clsx("mt-0.5", busy && "opacity-60")}>
        <span className="block text-lg font-semibold tabular-nums text-slate-900">{value}</span>
        {change && (
          <span className={clsx("block text-xs font-medium tabular-nums", TONE_CLASS[change.tone])}>
            {t("whatIf.stat.vsPlan", { change: isolate(change.text) })}
          </span>
        )}
      </dd>
    </div>
  );
}

interface WhatIfSummaryProps {
  draft: WhatIfOutcome;
  plan: WhatIfOutcome;
  /** False when the draft is the saved plan, so there is nothing to compare. */
  changed: boolean;
  /** The Monte Carlo chance of the draft and of the plan, in whole percent; null when none is available. */
  chance: { draft: number | null; plan: number | null; updating: boolean } | null;
  /** True when the tax-smart order is in play, so the tax it saves or adds is worth showing. */
  showTax?: boolean;
}

/** The handful of numbers that say what a draft does to the plan, each against the saved plan. */
export function WhatIfSummary({ draft, plan, changed, chance, showTax = false }: WhatIfSummaryProps) {
  const { t } = useTranslation();
  const { money, signedMoney, signedNumber } = useWhatIfFormat();

  const moneyChange = (now: number | null, before: number | null) =>
    changed && now !== null && before !== null
      ? { text: signedMoney(now - before), tone: toneOf(Math.round(now) - Math.round(before)) }
      : null;

  const lastsAge = (outcome: WhatIfOutcome) => outcome.runsOutAge ?? outcome.horizonAge;
  const hasSpending = draft.monthlySpending > 0;
  const runsOutInvolved = draft.runsOutAge !== null || plan.runsOutAge !== null;
  const lastsChange =
    changed && hasSpending && plan.monthlySpending > 0 && runsOutInvolved
      ? lastsAge(draft) - lastsAge(plan)
      : null;
  const chanceChange =
    changed && chance && chance.draft !== null && chance.plan !== null ? chance.draft - chance.plan : null;

  const taxChange =
    changed && showTax
      ? {
          text: signedMoney(draft.totalTax - plan.totalTax),
          tone: toneOf(-(Math.round(draft.totalTax) - Math.round(plan.totalTax))),
        }
      : null;

  return (
    <dl className="grid grid-cols-2 gap-2 xl:grid-cols-3">
      <Stat
        label={t("whatIf.stat.netIncome")}
        value={isolate(money(draft.netMonthlyIncome))}
        change={moneyChange(draft.netMonthlyIncome, plan.netMonthlyIncome)}
      />
      {draft.monthlyGap !== null && (
        <Stat
          label={t("whatIf.stat.gap")}
          value={isolate(signedMoney(draft.monthlyGap))}
          change={moneyChange(draft.monthlyGap, plan.monthlyGap)}
        />
      )}
      {hasSpending && (
        <Stat
          label={t("whatIf.stat.savingsLast")}
          value={t(draft.runsOutAge === null ? "whatIf.stat.lastsTo" : "whatIf.stat.runsOutAt", {
            age: isolate(String(lastsAge(draft))),
          })}
          change={
            lastsChange === null
              ? null
              : {
                  text: `${signedNumber(lastsChange)} ${t("whatIf.stat.yearsUnit")}`,
                  tone: toneOf(lastsChange),
                }
          }
        />
      )}
      <Stat
        label={t("whatIf.stat.savings")}
        value={isolate(money(draft.netWorthAtRetirement))}
        change={moneyChange(draft.netWorthAtRetirement, plan.netWorthAtRetirement)}
      />
      {showTax && (
        <Stat label={t("whatIf.stat.totalTax")} value={isolate(money(draft.totalTax))} change={taxChange} />
      )}
      {chance && (
        <Stat
          label={t("whatIf.stat.chance")}
          busy={chance.updating}
          value={chance.draft === null ? t("whatIf.stat.calculating") : isolate(`${chance.draft}%`)}
          change={
            chanceChange === null
              ? null
              : {
                  text: `${signedNumber(chanceChange)} ${t("whatIf.stat.pointsUnit")}`,
                  tone: toneOf(chanceChange),
                }
          }
        />
      )}
    </dl>
  );
}
