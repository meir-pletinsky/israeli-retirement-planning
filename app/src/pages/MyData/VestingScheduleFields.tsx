import { useTranslation } from "react-i18next";

import { NumberField } from "../../components/fields/NumberField";
import { MAX_TEMPLATE_BATCHES, engineNowMs, vestedQuantityAt } from "../../domain";
import { formatDate } from "../../i18n/formatters";
import type { StockHolding, VestingSchedule } from "../../types";

interface VestingScheduleFieldsProps {
  schedule: VestingSchedule;
  onChange: (schedule: VestingSchedule) => void;
  /** The holding the schedule is for; when given, a preview of its batches is shown. */
  holding?: StockHolding;
  /** Explains where the schedule applies; defaults to the single-holding text. */
  intro?: string;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Keeps digits reading left to right inside right-to-left text. */
const isolate = (text: string) => `\u2066${text}\u2069`;

/** How an award vests: this many equal batches, the first so many months after the grant, then one every so many months. */
export function VestingScheduleFields({ schedule, onChange, holding, intro }: VestingScheduleFieldsProps) {
  const { t } = useTranslation();
  const f = (key: string, params?: Record<string, unknown>) =>
    t(`myData.steps.equity.vesting.${key}`, params);

  const tranches = holding?.employerGrantDetails.vestingTranches ?? [];
  const vestedNow = holding ? vestedQuantityAt(holding, engineNowMs()) : 0;
  const quantity = holding?.quantity ?? 0;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-slate-200 p-3">
      <div>
        <h4 className="text-sm font-semibold text-slate-700">{f("title")}</h4>
        <p className="mt-1 text-xs text-slate-500">{intro ?? f("intro")}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <NumberField
          label={f("batches")}
          value={schedule.batches}
          onChange={(batches) => onChange({ ...schedule, batches })}
          min={1}
          max={MAX_TEMPLATE_BATCHES}
          step={1}
        />
        <NumberField
          label={f("every")}
          value={schedule.everyMonths}
          onChange={(everyMonths) => onChange({ ...schedule, everyMonths })}
          min={1}
          step={1}
        />
        <NumberField
          label={f("first")}
          value={schedule.firstVestMonths}
          onChange={(firstVestMonths) => onChange({ ...schedule, firstVestMonths })}
          min={0}
          step={1}
        />
      </div>
      {holding &&
        (tranches.length === 0 ? (
          <p className="text-xs text-slate-500">{f("needs")}</p>
        ) : (
          <>
            <p className="text-xs text-slate-500">
              {f("preview", {
                count: tranches.length,
                first: isolate(formatDate(tranches[0].vestDate ?? "")),
                last: isolate(formatDate(tranches[tranches.length - 1].vestDate ?? "")),
              })}
            </p>
            <p className="text-xs text-slate-600">
              {f("summary", {
                vested: round2(vestedNow),
                unvested: round2(Math.max(quantity - vestedNow, 0)),
              })}
            </p>
          </>
        ))}
    </div>
  );
}
