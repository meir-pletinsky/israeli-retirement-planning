import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatAxisMoney } from "./formatAxisMoney";

export interface ComparisonChartPoint {
  age: number;
  netMonthly: number;
}

interface ComparisonChartProps {
  data: ComparisonChartPoint[];
  /** Desired monthly spending drawn as a line; null when none was entered. */
  target: number | null;
  /** Age of the user's own plan, drawn in a stronger colour. */
  planAge?: number;
  currencySymbol: string;
  netLabel: string;
  targetLabel: string;
}

/** Income after tax per month for each compared retirement age, against the desired spending. */
export function ComparisonChart({
  data,
  target,
  planAge,
  currencySymbol,
  netLabel,
  targetLabel,
}: ComparisonChartProps) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="age" tick={{ fontSize: 12 }} stroke="#94a3b8" />
        <YAxis
          tick={{ fontSize: 12 }}
          stroke="#94a3b8"
          domain={[0, (dataMax: number) => Math.max(dataMax, target ?? 0)]}
          tickFormatter={(v: number) => formatAxisMoney(v, currencySymbol)}
        />
        <Tooltip
          formatter={(value) => `${currencySymbol}${Number(value).toLocaleString()}`}
          labelFormatter={(age) => String(age)}
        />
        <Bar dataKey="netMonthly" name={netLabel} maxBarSize={72} radius={[4, 4, 0, 0]}>
          {data.map((point) => (
            <Cell key={point.age} fill={point.age === planAge ? "#0f766e" : "#5eead4"} />
          ))}
        </Bar>
        {target !== null && (
          <ReferenceLine
            y={target}
            stroke="#e11d48"
            strokeDasharray="4 4"
            label={{ value: targetLabel, position: "insideTopRight", fontSize: 11, fill: "#e11d48" }}
          />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}
