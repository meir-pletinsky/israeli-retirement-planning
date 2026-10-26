import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  INCOME_BAND_KEYS,
  type IncomeBandKey,
  type IncomeBreakdownPoint,
} from "../../domain";
import { INCOME_BAND_COLORS } from "./incomeBandColors";

interface IncomeBreakdownChartProps {
  data: IncomeBreakdownPoint[];
  currencySymbol: string;
  labels: Record<IncomeBandKey, string>;
}

export function IncomeBreakdownChart({ data, currencySymbol, labels }: IncomeBreakdownChartProps) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="age" tick={{ fontSize: 12 }} stroke="#94a3b8" />
        <YAxis
          tick={{ fontSize: 12 }}
          stroke="#94a3b8"
          tickFormatter={(v: number) => `${currencySymbol}${v}`}
        />
        <Tooltip
          formatter={(value) =>
            `${currencySymbol}${Number(value).toLocaleString()}`
          }
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {INCOME_BAND_KEYS.map((band, index) => (
          <Bar
            key={band}
            dataKey={band}
            name={labels[band]}
            stackId="income"
            fill={INCOME_BAND_COLORS[band]}
            radius={index === INCOME_BAND_KEYS.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
