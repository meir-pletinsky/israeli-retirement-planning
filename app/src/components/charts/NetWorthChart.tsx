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

interface NetWorthChartProps {
  data: NetWorthPoint[];
  retirementAge?: number;
  currencySymbol: string;
}

export function NetWorthChart({
  data,
  retirementAge,
  currencySymbol,
}: NetWorthChartProps) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
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
        {retirementAge && (
          <ReferenceLine
            x={retirementAge}
            stroke="#0d9488"
            strokeDasharray="4 4"
          />
        )}
        <Line
          type="monotone"
          dataKey="netWorth"
          stroke="#0d9488"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
