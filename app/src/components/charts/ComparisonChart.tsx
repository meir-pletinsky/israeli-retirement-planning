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

import { chartA11y } from "./chartA11y";
import { ageAxis, moneyAxis } from "./chartAxes";
import { CHART_COLORS, PLANNED_LINE_STYLE } from "./chartPalette";
import { useChartTexts } from "./useChartTexts";

export interface ComparisonChartPoint {
  age: number;
  netMonthly: number;
}

interface ComparisonChartProps {
  /** The chart's accessible name. */
  name: string;
  /** What the chart shows in a sentence, for screen readers. */
  description: string;
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
  name,
  description,
  data,
  target,
  planAge,
  currencySymbol,
  netLabel,
  targetLabel,
}: ComparisonChartProps) {
  const texts = useChartTexts();
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} {...chartA11y(name, description)}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis {...ageAxis(texts.retirementAgeAxis)} />
        <YAxis
          {...moneyAxis(texts.monthlyAxis, currencySymbol)}
          domain={[0, (dataMax: number) => Math.max(dataMax, target ?? 0)]}
        />
        <Tooltip
          formatter={(value) => `${currencySymbol}${Number(value).toLocaleString()}`}
          labelFormatter={texts.retireAtHeading}
        />
        <Bar dataKey="netMonthly" name={netLabel} maxBarSize={72} radius={[4, 4, 0, 0]}>
          {data.map((point) => (
            <Cell
              key={point.age}
              fill={point.age === planAge ? CHART_COLORS.total : CHART_COLORS.muted}
            />
          ))}
        </Bar>
        {target !== null && (
          <ReferenceLine
            y={target}
            stroke={CHART_COLORS.planned}
            {...PLANNED_LINE_STYLE}
            label={{ value: targetLabel, position: "insideTopRight", fontSize: 11, fill: CHART_COLORS.planned }}
          />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}
