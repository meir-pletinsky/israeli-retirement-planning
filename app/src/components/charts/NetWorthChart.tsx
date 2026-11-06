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
import { formatAxisMoney } from "./formatAxisMoney";

export interface NetWorthMarker {
  age: number;
  /** The number printed on the line; the list under the chart uses the same one. */
  label: string;
}

interface NetWorthChartProps {
  data: NetWorthPoint[];
  /** Numbered lines for the events that explain the path (retirement, annuity start). */
  markers?: NetWorthMarker[];
  /** The age at which the planned spending first goes unfunded, marked on the line. */
  shortfallAge?: number | null;
  shortfallLabel?: string;
  currencySymbol: string;
}

export function NetWorthChart({
  data,
  markers = [],
  shortfallAge,
  shortfallLabel,
  currencySymbol,
}: NetWorthChartProps) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 20, right: 8, left: 8, bottom: 0 }}>
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
            stroke="#0b6e99"
            strokeDasharray="4 4"
            label={{ value: marker.label, position: "top", fontSize: 11, fontWeight: 600, fill: "#0b6e99" }}
          />
        ))}
        {shortfallAge != null && (
          <ReferenceLine
            x={shortfallAge}
            stroke="#e11d48"
            strokeDasharray="4 4"
            label={{ value: shortfallLabel, position: "insideTopRight", fontSize: 11, fill: "#be123c" }}
          />
        )}
        <Line
          type="monotone"
          dataKey="netWorth"
          stroke="#0b6e99"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
