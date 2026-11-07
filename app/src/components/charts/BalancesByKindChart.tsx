import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts";

import { BAND_FOR_KIND, type BalancePoint, type SourceKind } from "../../domain";
import { formatNumber } from "../../i18n/formatters";
import { chartA11y } from "./chartA11y";
import { ageAxis, moneyAxis } from "./chartAxes";
import { CHART_COLORS } from "./chartPalette";
import { INCOME_BAND_COLORS } from "./incomeBandColors";
import type { NetWorthMarker } from "./NetWorthChart";
import { useChartTexts } from "./useChartTexts";

interface BalancesByKindChartProps {
  /** The chart's accessible name. */
  name: string;
  /** What the chart shows in a sentence, for screen readers. */
  description: string;
  points: BalancePoint[];
  /** The kinds that hold a balance at some age, in display order (the bottom of the stack first). */
  kinds: SourceKind[];
  kindLabels: Record<SourceKind, string>;
  totalLabel: string;
  /** Numbered lines for the events that explain the path (retirement, annuity start). */
  markers?: NetWorthMarker[];
  /** The age at which the planned spending first goes unfunded, marked on the chart. */
  shortfallAge?: number | null;
  shortfallLabel?: string;
  currencySymbol: string;
}

const kindColor = (kind: SourceKind) => INCOME_BAND_COLORS[BAND_FOR_KIND[kind]];

/**
 * The savings over time as a stack, one band per kind of savings, so the chart shows what the
 * total is made of and when each part runs out; the total is the top edge of the stack. The
 * colors are the ones the income charts use for the same kinds.
 */
export function BalancesByKindChart({
  name,
  description,
  points,
  kinds,
  kindLabels,
  totalLabel,
  markers = [],
  shortfallAge,
  shortfallLabel,
  currencySymbol,
}: BalancesByKindChartProps) {
  const texts = useChartTexts();
  const money = (value: number) => `${currencySymbol}${formatNumber(Math.round(value))}`;
  const rows = points.map((point) => ({ age: point.age, ...point.byKind }));

  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={rows} margin={{ top: 20, right: 8, left: 8, bottom: 0 }} {...chartA11y(name, description)}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis {...ageAxis(texts.ageAxis)} />
          <YAxis {...moneyAxis(texts.balanceAxis, currencySymbol)} />
          <Tooltip
            content={(props: TooltipContentProps) => (
              <BalancesTooltip
                {...props}
                kinds={kinds}
                kindLabels={kindLabels}
                money={money}
                totalLabel={totalLabel}
                ageHeading={texts.ageHeading}
              />
            )}
          />
          {kinds.map((kind) => (
            <Area
              key={kind}
              type="monotone"
              dataKey={kind}
              name={kindLabels[kind]}
              stackId="balance"
              stroke={kindColor(kind)}
              strokeWidth={1.5}
              fill={kindColor(kind)}
              fillOpacity={0.55}
              dot={false}
              isAnimationActive={false}
            />
          ))}
          {markers.map((marker) => (
            <ReferenceLine
              key={marker.age}
              x={marker.age}
              stroke={CHART_COLORS.marker}
              strokeDasharray="4 4"
              label={{ value: marker.label, position: "top", fontSize: 11, fontWeight: 600, fill: CHART_COLORS.marker }}
            />
          ))}
          {shortfallAge != null && (
            <ReferenceLine
              x={shortfallAge}
              stroke={CHART_COLORS.shortfall}
              strokeDasharray="4 4"
              label={{ value: shortfallLabel, position: "insideTopRight", fontSize: 11, fill: CHART_COLORS.shortfall }}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
        {kinds.map((kind) => (
          <li key={kind} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: kindColor(kind) }}
            />
            <span>{kindLabels[kind]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface BalancesTooltipProps extends TooltipContentProps {
  kinds: SourceKind[];
  kindLabels: Record<SourceKind, string>;
  money: (value: number) => string;
  totalLabel: string;
  ageHeading: (age: unknown) => string;
}

/** Lists the kinds of savings that hold a balance at this age, top of the stack first, and the total. */
function BalancesTooltip({
  active,
  payload,
  label,
  kinds,
  kindLabels,
  money,
  totalLabel,
  ageHeading,
}: BalancesTooltipProps) {
  if (!active || !payload?.length) return null;
  const entries = [...kinds]
    .reverse()
    .map((kind) => ({ kind, value: Number(payload.find((item) => item.dataKey === kind)?.value ?? 0) }))
    .filter(({ value }) => value > 0);
  const total = entries.reduce((sum, { value }) => sum + value, 0);
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 font-medium text-slate-800">{ageHeading(label)}</p>
      <ul className="flex flex-col gap-0.5">
        {entries.map(({ kind, value }) => (
          <li key={kind} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: kindColor(kind) }}
            />
            <span>{kindLabels[kind]}</span>
            <span className="ms-auto ps-3 tabular-nums">{money(value)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1 flex border-t border-slate-100 pt-1 font-medium text-slate-800">
        <span>{totalLabel}</span>
        <span className="ms-auto ps-3 tabular-nums">{money(total)}</span>
      </p>
    </div>
  );
}
