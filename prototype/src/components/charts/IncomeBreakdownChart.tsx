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

import type { IncomeBreakdownPoint } from "../../data/mockData";

interface IncomeBreakdownChartProps {
  data: IncomeBreakdownPoint[];
  currencySymbol: string;
  pensionLabel: string;
  investmentsLabel: string;
}

export function IncomeBreakdownChart({
  data,
  currencySymbol,
  pensionLabel,
  investmentsLabel,
}: IncomeBreakdownChartProps) {
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
        <Bar
          dataKey="pensionFund"
          name={pensionLabel}
          stackId="income"
          fill="#0d9488"
          radius={[0, 0, 0, 0]}
        />
        <Bar
          dataKey="investments"
          name={investmentsLabel}
          stackId="income"
          fill="#94a3b8"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
