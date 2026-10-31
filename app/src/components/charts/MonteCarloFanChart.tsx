import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { MonteCarloFanPoint } from "../../domain";
import { formatAxisMoney } from "./formatAxisMoney";

interface MonteCarloFanChartProps {
  data: MonteCarloFanPoint[];
  /** The age at which the household starts drawing, marked on the chart. */
  drawdownStartAge: number;
  currencySymbol: string;
  bandLabel: string;
  medianLabel: string;
}

/** Net worth across many random market histories: the middle 80% as a band, the median as a line. */
export function MonteCarloFanChart({
  data,
  drawdownStartAge,
  currencySymbol,
  bandLabel,
  medianLabel,
}: MonteCarloFanChartProps) {
  const money = (value: number) => `${currencySymbol}${Math.round(value).toLocaleString()}`;
  const points = data.map((point) => ({ ...point, band: [point.p10, point.p90] }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="age" tick={{ fontSize: 12 }} stroke="#94a3b8" />
        <YAxis
          tick={{ fontSize: 12 }}
          stroke="#94a3b8"
          tickFormatter={(value: number) => formatAxisMoney(value, currencySymbol)}
        />
        <Tooltip
          formatter={(value) =>
            Array.isArray(value) ? `${money(value[0])} – ${money(value[1])}` : money(Number(value))
          }
        />
        <ReferenceLine x={drawdownStartAge} stroke="#0b6e99" strokeDasharray="4 4" />
        <Area
          type="monotone"
          dataKey="band"
          name={bandLabel}
          stroke="none"
          fill="#0b6e99"
          fillOpacity={0.18}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="p50"
          name={medianLabel}
          stroke="#0b6e99"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
