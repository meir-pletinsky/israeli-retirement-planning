import clsx from "clsx";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import type { WhatIfRange } from "../../domain";

const isolate = (text: string) => `\u2066${text}\u2069`;

interface WhatIfSliderProps {
  label: string;
  value: number;
  /** The saved plan's value: marked on the track and offered as the way back. */
  baseline: number;
  range: WhatIfRange;
  onChange: (value: number) => void;
  /** How a value reads, e.g. "6.5%". */
  format: (value: number) => string;
  /** Facts about the current value that the track cannot show, such as why a pension is locked. */
  notes?: string[];
}

/** One what-if parameter: a slider inside a reasonable range, the plan's own value marked on it. */
export function WhatIfSlider({ label, value, baseline, range, onChange, format, notes = [] }: WhatIfSliderProps) {
  const { t } = useTranslation();
  const id = useId();
  const changed = value !== baseline;
  const span = range.max - range.min;
  const baselineFraction = span > 0 ? Math.min(Math.max((baseline - range.min) / span, 0), 1) : 0;
  const noteIds = notes.map((_note, index) => `${id}-note-${index}`);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-slate-800">
          {label}
        </label>
        <output
          htmlFor={id}
          className={clsx("text-sm font-semibold tabular-nums", changed ? "text-brand-700" : "text-slate-900")}
        >
          {isolate(format(value))}
        </output>
      </div>
      <div className="relative mt-1">
        <input
          id={id}
          type="range"
          min={range.min}
          max={range.max}
          step={range.step}
          value={value}
          aria-valuetext={format(value)}
          aria-describedby={noteIds.length > 0 ? noteIds.join(" ") : undefined}
          onChange={(event) => onChange(Number(event.target.value))}
          className="block h-6 w-full cursor-pointer accent-brand-600"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-1 -ms-px h-2 w-0.5 rounded bg-slate-500"
          style={{ insetInlineStart: `calc(0.5rem + (100% - 1rem) * ${baselineFraction})` }}
        />
      </div>
      <div className="mt-1 flex justify-between gap-2 text-xs text-slate-500 tabular-nums">
        <span>{isolate(format(range.min))}</span>
        {changed ? (
          <button
            type="button"
            onClick={() => onChange(baseline)}
            className="font-medium text-brand-700 hover:underline"
          >
            {t("whatIf.slider.backToPlan", { value: isolate(format(baseline)) })}
          </button>
        ) : (
          <span>{t("whatIf.slider.yourPlan")}</span>
        )}
        <span>{isolate(format(range.max))}</span>
      </div>
      {notes.map((note, index) => (
        <p
          key={noteIds[index]}
          id={noteIds[index]}
          className="mt-1.5 border-s-2 border-amber-500 ps-2 text-xs text-slate-700"
        >
          {note}
        </p>
      ))}
    </div>
  );
}
