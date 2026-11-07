import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { NetWorthPoint } from "../../domain";
import { chartA11y } from "./chartA11y";
import { CHART_COLORS } from "./chartPalette";
import { formatAxisMoney } from "./formatAxisMoney";

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
  data: NetWorthPoint[];
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
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 20, right: 8, left: 8, bottom: 0 }} {...chartA11y(name, description)}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="age" tick={{ fontSize: 12 }} stroke="#94a3b8" />
        <YAxis
          tick={{ fontSize: 12 }}
          stroke="#94a3b8"
          tickFormatter={(v: number) => formatAxisMoney(v, currencySymbol)}
        />
        <Tooltip
          formatter={(value) =>
            `${currencySymbol}${Number(value).toLocaleString()}`
          }
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
          stroke={CHART_COLORS.total}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
