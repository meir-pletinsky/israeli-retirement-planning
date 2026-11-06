import { useId } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts";

import {
  INCOME_BAND_KEYS,
  recurringAmount,
  type IncomeBandKey,
  type IncomeBreakdownPoint,
} from "../../domain";
import { BandSwatch } from "./BandSwatch";
import { formatAxisMoney } from "./formatAxisMoney";
import { INCOME_BAND_COLORS } from "./incomeBandColors";

export interface IncomeBreakdownTexts {
  /** Heading of the recurring payments (Bituach Leumi, annuities). */
  payments: string;
  /** Heading of the withdrawals from savings. */
  withdrawals: string;
  total: string;
  paymentOf: (source: string) => string;
  withdrawalOf: (source: string) => string;
}

interface IncomeBreakdownChartProps {
  data: IncomeBreakdownPoint[];
  currencySymbol: string;
  labels: Record<IncomeBandKey, string>;
  texts: IncomeBreakdownTexts;
}

interface Series {
  dataKey: string;
  band: IncomeBandKey;
  withdrawal: boolean;
  name: string;
}

const withdrawalKey = (band: IncomeBandKey) => `${band}Withdrawn`;

export function IncomeBreakdownChart({
  data,
  currencySymbol,
  labels,
  texts,
}: IncomeBreakdownChartProps) {
  const patternPrefix = useId().replace(/:/g, "");

  const payments: Series[] = INCOME_BAND_KEYS.filter((band) =>
    data.some((point) => recurringAmount(point, band) > 0),
  ).map((band) => ({
    dataKey: band,
    band,
    withdrawal: false,
    name: texts.paymentOf(labels[band]),
  }));
  const withdrawals: Series[] = INCOME_BAND_KEYS.filter((band) =>
    data.some((point) => point.withdrawn[band] > 0),
  ).map((band) => ({
    dataKey: withdrawalKey(band),
    band,
    withdrawal: true,
    name: texts.withdrawalOf(labels[band]),
  }));
  // Recurring payments sit at the bottom of each bar and the withdrawals from savings on top.
  const series = [...payments, ...withdrawals];

  const rows = data.map((point) => {
    const row: Record<string, number> = { age: point.age };
    for (const band of INCOME_BAND_KEYS) {
      row[band] = recurringAmount(point, band);
      row[withdrawalKey(band)] = point.withdrawn[band];
    }
    return row;
  });

  const patternId = (band: IncomeBandKey) => `${patternPrefix}-${band}`;
  const money = (value: number) => `${currencySymbol}${Math.round(value).toLocaleString()}`;

  const legendGroups = [
    { heading: texts.payments, items: payments },
    { heading: texts.withdrawals, items: withdrawals },
  ].filter((group) => group.items.length > 0);

  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <defs>
            {withdrawals.map(({ band }) => (
              <pattern
                key={band}
                id={patternId(band)}
                patternUnits="userSpaceOnUse"
                width={6}
                height={6}
                patternTransform="rotate(45)"
              >
                <rect width={6} height={6} fill="#ffffff" />
                <rect width={3} height={6} fill={INCOME_BAND_COLORS[band]} />
              </pattern>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="age" tick={{ fontSize: 12 }} stroke="#94a3b8" />
          <YAxis
            tick={{ fontSize: 12 }}
            stroke="#94a3b8"
            tickFormatter={(v: number) => formatAxisMoney(v, currencySymbol)}
          />
          <Tooltip
            content={(props: TooltipContentProps) => (
              <IncomeTooltip {...props} series={series} money={money} totalLabel={texts.total} />
            )}
          />
          {series.map((entry, index) => (
            <Bar
              key={entry.dataKey}
              dataKey={entry.dataKey}
              name={entry.name}
              stackId="income"
              fill={entry.withdrawal ? `url(#${patternId(entry.band)})` : INCOME_BAND_COLORS[entry.band]}
              stroke={entry.withdrawal ? INCOME_BAND_COLORS[entry.band] : undefined}
              radius={index === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-col gap-2 text-xs text-slate-700">
        {legendGroups.map((group) => (
          <div key={group.heading}>
            <p className="font-medium text-slate-600">{group.heading}</p>
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {group.items.map((entry) => (
                <li key={entry.dataKey} className="flex items-center gap-1.5">
                  <BandSwatch band={entry.band} hatched={entry.withdrawal} />
                  <span>{labels[entry.band]}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

interface IncomeTooltipProps extends TooltipContentProps {
  series: Series[];
  money: (value: number) => string;
  totalLabel: string;
}

/** Lists only the sources that pay at this age, so unused categories do not pad the tooltip. */
function IncomeTooltip({ active, payload, label, series, money, totalLabel }: IncomeTooltipProps) {
  if (!active || !payload?.length) return null;
  const entries = series
    .map((entry) => ({
      entry,
      value: Number(payload.find((item) => item.dataKey === entry.dataKey)?.value ?? 0),
    }))
    .filter(({ value }) => value > 0);
  const total = entries.reduce((sum, { value }) => sum + value, 0);
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 font-medium text-slate-800">{label}</p>
      <ul className="flex flex-col gap-0.5">
        {entries.map(({ entry, value }) => (
          <li key={entry.dataKey} className="flex items-center gap-1.5">
            <BandSwatch band={entry.band} hatched={entry.withdrawal} />
            <span>{entry.name}</span>
            <span className="ms-auto ps-3 tabular-nums">{money(value)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1 flex border-t border-slate-100 pt-1 font-medium text-slate-800">
        <span>{totalLabel}</span>
        <span className="ms-auto ps-3 tabular-nums">{money(total)}</span>
      </p>
    </div>
  );
}
