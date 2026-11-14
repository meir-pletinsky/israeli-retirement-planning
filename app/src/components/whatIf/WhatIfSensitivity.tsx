import clsx from "clsx";
import { useTranslation } from "react-i18next";

import type { SensitivityRow, SensitivitySide } from "../../domain";
import { useWhatIfFormat } from "./useWhatIfFormat";

const isolate = (text: string) => `\u2066${text}\u2069`;

interface WhatIfSensitivityProps {
  rows: SensitivityRow[];
  /** True when planned spending is entered, so the bars measure income minus spending. */
  hasSpending: boolean;
}

/** One tested value: its bar from the centre line, worse to one side and better to the other. */
function Side({ side, keyName, scale }: { side: SensitivitySide; keyName: SensitivityRow["key"]; scale: number }) {
  const { value, signedMoney } = useWhatIfFormat();
  const width = scale > 0 ? (Math.abs(side.delta) / scale) * 50 : 0;
  const better = side.delta > 0;
  const worse = side.delta < 0;
  return (
    <li className="grid grid-cols-[4.5rem_minmax(0,1fr)_5.5rem] items-center gap-2 text-xs">
      <span className="text-slate-600 tabular-nums">{isolate(value(keyName, side.value))}</span>
      <span className="relative h-3 rounded-sm bg-slate-100" aria-hidden="true">
        <span className="absolute inset-y-0 start-1/2 w-px bg-slate-400" />
        {width > 0 && (
          <span
            className={clsx("absolute inset-y-0.5 rounded-sm", better ? "bg-emerald-600" : "bg-amber-600")}
            style={{ insetInlineStart: better ? "50%" : `${50 - width}%`, width: `${width}%` }}
          />
        )}
      </span>
      <span
        className={clsx(
          "text-end font-medium tabular-nums",
          better && "text-emerald-700",
          worse && "text-amber-700",
          !better && !worse && "text-slate-600",
        )}
      >
        {isolate(signedMoney(side.delta))}
      </span>
    </li>
  );
}

/** Which assumptions the plan leans on most: each one moved alone, from where the sliders now are. */
export function WhatIfSensitivity({ rows, hasSpending }: WhatIfSensitivityProps) {
  const { t } = useTranslation();
  const { label } = useWhatIfFormat();
  const visible = rows.filter((row) => row.down !== null || row.up !== null);
  const scale = Math.max(...visible.map((row) => row.swing), 0);

  return (
    <section aria-labelledby="whatif-sensitivity-title" className="card">
      <h3 id="whatif-sensitivity-title" className="text-base font-semibold text-slate-900">
        {t("whatIf.sensitivity.title")}
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        {t(hasSpending ? "whatIf.sensitivity.introGap" : "whatIf.sensitivity.introNet")}
      </p>
      <div className="mt-3 flex flex-col gap-3">
        <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_5.5rem] gap-2 text-xs text-slate-500" aria-hidden="true">
          <span />
          <span className="flex justify-between">
            <span>{t("whatIf.sensitivity.worse")}</span>
            <span>{t("whatIf.sensitivity.better")}</span>
          </span>
          <span />
        </div>
        {visible.map((row) => (
          <div key={row.key}>
            <p className="text-sm font-medium text-slate-800">{label(row.key)}</p>
            <ul className="mt-1 flex flex-col gap-1">
              {row.down && <Side side={row.down} keyName={row.key} scale={scale} />}
              {row.up && <Side side={row.up} keyName={row.key} scale={scale} />}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">{t("whatIf.sensitivity.note")}</p>
    </section>
  );
}
