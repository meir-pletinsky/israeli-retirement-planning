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

import type { NetIncomeYear } from "../../domain";
import { formatAxisMoney } from "./formatAxisMoney";

interface NetIncomeChartProps {
  data: NetIncomeYear[];
  currencySymbol: string;
  netLabel: string;
  taxLabel: string;
}

/** Each bar is a year's gross income: the part kept (net) with the tax stacked on top. */
export function NetIncomeChart({ data, currencySymbol, netLabel, taxLabel }: NetIncomeChartProps) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="age" tick={{ fontSize: 12 }} stroke="#94a3b8" />
        <YAxis
          tick={{ fontSize: 12 }}
          stroke="#94a3b8"
          tickFormatter={(v: number) => formatAxisMoney(v, currencySymbol)}
        />
        <Tooltip
          formatter={(value) => `${currencySymbol}${Number(value).toLocaleString()}`}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="netMonthly" name={netLabel} stackId="income" fill="#0d9488" />
        <Bar
          dataKey="taxMonthly"
          name={taxLabel}
          stackId="income"
          fill="#e11d48"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
