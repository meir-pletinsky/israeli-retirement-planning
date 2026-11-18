import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { TaxYear } from "../../domain";
import { formatNumber } from "../../i18n/formatters";
import { chartA11y } from "./chartA11y";
import { ageAxis, moneyAxis } from "./chartAxes";
import { CHART_COLORS } from "./chartPalette";
import { useChartTexts } from "./useChartTexts";

interface TaxByYearChartProps {
  /** The chart's accessible name. */
  name: string;
  /** What the chart shows in a sentence, for screen readers. */
  description: string;
  data: TaxYear[];
  currencySymbol: string;
  taxLabel: string;
}

/** One bar per retirement year: the estimated tax, as a monthly average in today's money. */
export function TaxByYearChart({ name, description, data, currencySymbol, taxLabel }: TaxByYearChartProps) {
  const texts = useChartTexts();
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} {...chartA11y(name, description)}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis {...ageAxis(texts.ageAxis)} />
        <YAxis {...moneyAxis(texts.monthlyAxis, currencySymbol)} domain={[0, (max: number) => Math.max(max, 100)]} />
        <Tooltip
          formatter={(value) => `${currencySymbol}${formatNumber(Number(value))}`}
          labelFormatter={texts.ageHeading}
        />
        <Bar dataKey="taxMonthly" name={taxLabel} fill={CHART_COLORS.muted} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
