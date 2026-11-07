import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts";

import { SOURCE_KINDS, type NetWorthPoint, type SourceKind } from "../../domain";
import { chartA11y } from "./chartA11y";
import { ageAxis, moneyAxis } from "./chartAxes";
import { CHART_COLORS } from "./chartPalette";
import { useChartTexts } from "./useChartTexts";

/** A point of the line; with the split by kind, the tooltip shows what the total is made of. */
export type NetWorthChartPoint = NetWorthPoint & { byKind?: Partial<Record<SourceKind, number>> };

export interface NetWorthMarker {
  age: number;
  /** The number printed on the line; the list under the chart uses the same one. */
  label: string;
}

interface NetWorthChartProps {
  /** The chart's accessible name. */
  name: string;
  /** What the chart shows in a sentence, for screen readers. */
  description: string;
  data: NetWorthChartPoint[];
  /** Numbered lines for the events that explain the path (retirement, annuity start). */
  markers?: NetWorthMarker[];
  /** The age at which the planned spending first goes unfunded, marked on the line. */
  shortfallAge?: number | null;
  shortfallLabel?: string;
  currencySymbol: string;
}

export function NetWorthChart({
  name,
  description,
  data,
  markers = [],
  shortfallAge,
  shortfallLabel,
  currencySymbol,
}: NetWorthChartProps) {
  const texts = useChartTexts();

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 20, right: 8, left: 8, bottom: 0 }} {...chartA11y(name, description)}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis {...ageAxis(texts.ageAxis)} />
        <YAxis {...moneyAxis(texts.balanceAxis, currencySymbol)} />
        <Tooltip
          content={(props: TooltipContentProps) => (
            <NetWorthTooltip
              active={props.active}
              payload={props.payload}
              label={props.label}
              currencySymbol={currencySymbol}
            />
          )}
        />
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
        <Line
          type="monotone"
          dataKey="netWorth"
          name={texts.netWorth}
          stroke={CHART_COLORS.total}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

interface NetWorthTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }>;
  label?: unknown;
  currencySymbol: string;
}

/** The age, what the savings are made of at that age, and the net worth they add up to. */
export function NetWorthTooltip({ active, payload, label, currencySymbol }: NetWorthTooltipProps) {
  const texts = useChartTexts();
  const point = payload?.[0]?.payload as NetWorthChartPoint | undefined;
  if (!active || !point) return null;
  const money = (value: number) => `${currencySymbol}${Math.round(value).toLocaleString()}`;
  const parts = SOURCE_KINDS.map((kind) => ({ kind, value: point.byKind?.[kind] ?? 0 })).filter(
    ({ value }) => value > 0,
  );
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 font-medium text-slate-800">{texts.ageHeading(label)}</p>
      {parts.length > 0 && (
        <ul className="mb-1 flex flex-col gap-0.5 border-b border-slate-100 pb-1">
          {parts.map(({ kind, value }) => (
            <li key={kind} className="flex">
              <span>{texts.kindLabels[kind]}</span>
              <span className="ms-auto ps-3 tabular-nums">{money(value)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="flex font-medium text-slate-800">
        <span>{texts.netWorth}</span>
        <span className="ms-auto ps-3 tabular-nums">{money(point.netWorth)}</span>
      </p>
    </div>
  );
}
