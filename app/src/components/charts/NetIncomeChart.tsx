import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { NetIncomeYear } from "../../domain";
import { chartA11y } from "./chartA11y";
import { CHART_COLORS, PLANNED_LINE_STYLE } from "./chartPalette";
import { formatAxisMoney } from "./formatAxisMoney";

interface NetIncomeChartProps {
  /** The chart's accessible name. */
  name: string;
  /** What the chart shows in a sentence, for screen readers. */
  description: string;
  data: NetIncomeYear[];
  currencySymbol: string;
  netLabel: string;
  taxLabel: string;
  /** The planned monthly spending after tax, drawn as a line to compare the bars with. */
  plannedMonthly?: number;
  plannedLabel?: string;
}

/** Each bar is a year's gross income: the part kept (net) with the tax stacked on top. */
export function NetIncomeChart({
  name,
  description,
  data,
  currencySymbol,
  netLabel,
  taxLabel,
  plannedMonthly,
  plannedLabel,
}: NetIncomeChartProps) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} {...chartA11y(name, description)}>
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
        <Bar dataKey="netMonthly" name={netLabel} stackId="income" fill={CHART_COLORS.total} />
        <Bar
          dataKey="taxMonthly"
          name={taxLabel}
          stackId="income"
          fill={CHART_COLORS.muted}
          radius={[4, 4, 0, 0]}
        />
        {plannedMonthly != null && plannedMonthly > 0 && (
          <ReferenceLine
            y={plannedMonthly}
            ifOverflow="extendDomain"
            stroke={CHART_COLORS.planned}
            {...PLANNED_LINE_STYLE}
            label={{ value: plannedLabel, position: "insideTopRight", fontSize: 11, fill: CHART_COLORS.planned }}
          />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}
