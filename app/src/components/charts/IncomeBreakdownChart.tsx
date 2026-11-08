import { useId } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
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
import { formatNumber } from "../../i18n/formatters";
import { BandSwatch } from "./BandSwatch";
import { chartA11y } from "./chartA11y";
import { ageAxis, moneyAxis } from "./chartAxes";
import { CHART_COLORS, PLANNED_LINE_STYLE } from "./chartPalette";
import { INCOME_BAND_COLORS } from "./incomeBandColors";
import { useChartTexts } from "./useChartTexts";

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
  /** The chart's accessible name. */
  name: string;
  /** What the chart shows in a sentence, for screen readers. */
  description: string;
  data: IncomeBreakdownPoint[];
  currencySymbol: string;
  labels: Record<IncomeBandKey, string>;
  texts: IncomeBreakdownTexts;
  /** The planned monthly spending, drawn as the dashed line used in every chart. */
  planned?: { monthly: number; label: string };
  /** Names the part of the spending nobody pays; stacked on top when any point has `unfunded`. */
  unfundedLabel?: string;
}

interface Series {
  dataKey: string;
  kind: "payment" | "withdrawal" | "unfunded";
  band?: IncomeBandKey;
  name: string;
}

const withdrawalKey = (band: IncomeBandKey) => `${band}Withdrawn`;
const UNFUNDED_KEY = "unfunded";

/** Legend square of the unfunded part: crosshatched in the shortfall red, unlike the withdrawals' single hatch. */
function UnfundedSwatch() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
      style={{
        backgroundImage: `repeating-linear-gradient(45deg, ${CHART_COLORS.shortfall} 0 1px, #ffffff 1px 3px), repeating-linear-gradient(-45deg, ${CHART_COLORS.shortfall} 0 1px, transparent 1px 3px)`,
        border: `1px solid ${CHART_COLORS.shortfall}`,
      }}
    />
  );
}

function SeriesSwatch({ entry }: { entry: Series }) {
  return entry.kind === "unfunded" ? (
    <UnfundedSwatch />
  ) : (
    <BandSwatch band={entry.band!} hatched={entry.kind === "withdrawal"} />
  );
}

export function IncomeBreakdownChart({
  name,
  description,
  data,
  currencySymbol,
  labels,
  texts,
  planned,
  unfundedLabel,
}: IncomeBreakdownChartProps) {
  const chartTexts = useChartTexts();
  const patternPrefix = useId().replace(/:/g, "");

  const payments: Series[] = INCOME_BAND_KEYS.filter((band) =>
    data.some((point) => recurringAmount(point, band) > 0),
  ).map((band) => ({
    dataKey: band,
    kind: "payment",
    band,
    name: texts.paymentOf(labels[band]),
  }));
  const withdrawals: Series[] = INCOME_BAND_KEYS.filter((band) =>
    data.some((point) => point.withdrawn[band] > 0),
  ).map((band) => ({
    dataKey: withdrawalKey(band),
    kind: "withdrawal",
    band,
    name: texts.withdrawalOf(labels[band]),
  }));
  const unfunded: Series[] =
    unfundedLabel && data.some((point) => (point.unfunded ?? 0) > 0)
      ? [{ dataKey: UNFUNDED_KEY, kind: "unfunded", name: unfundedLabel }]
      : [];
  // Recurring payments sit at the bottom of each bar, the withdrawals from savings above them,
  // and what nobody pays on top.
  const series = [...payments, ...withdrawals, ...unfunded];

  const rows = data.map((point) => {
    const row: Record<string, number> = { age: point.age };
    for (const band of INCOME_BAND_KEYS) {
      row[band] = recurringAmount(point, band);
      row[withdrawalKey(band)] = point.withdrawn[band];
    }
    row[UNFUNDED_KEY] = point.unfunded ?? 0;
    return row;
  });

  const patternId = (band: IncomeBandKey) => `${patternPrefix}-${band}`;
  const unfundedPatternId = `${patternPrefix}-unfunded`;
  const money = (value: number) => `${currencySymbol}${formatNumber(Math.round(value))}`;

  const legendGroups = [
    { heading: texts.payments, items: payments },
    { heading: texts.withdrawals, items: withdrawals },
  ].filter((group) => group.items.length > 0);

  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} {...chartA11y(name, description)}>
          <defs>
            {withdrawals.map(({ band }) => (
              <pattern
                key={band}
                id={patternId(band!)}
                patternUnits="userSpaceOnUse"
                width={8}
                height={8}
                patternTransform="rotate(45)"
              >
                <rect width={8} height={8} fill={INCOME_BAND_COLORS[band!]} fillOpacity={0.55} />
                <rect width={2.5} height={8} fill={INCOME_BAND_COLORS[band!]} />
              </pattern>
            ))}
            {unfunded.length > 0 && (
              <pattern id={unfundedPatternId} patternUnits="userSpaceOnUse" width={6} height={6}>
                <rect width={6} height={6} fill="#ffffff" />
                <path d="M0 0L6 6M6 0L0 6" stroke={CHART_COLORS.shortfall} strokeWidth={1} />
              </pattern>
            )}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis {...ageAxis(chartTexts.ageAxis)} />
          <YAxis {...moneyAxis(chartTexts.monthlyAxis, currencySymbol)} />
          <Tooltip
            content={(props: TooltipContentProps) => (
              <IncomeTooltip
                {...props}
                series={series}
                money={money}
                totalLabel={texts.total}
                ageHeading={chartTexts.ageHeading}
              />
            )}
          />
          {series.map((entry, index) => (
            <Bar
              key={entry.dataKey}
              dataKey={entry.dataKey}
              name={entry.name}
              stackId="income"
              fill={
                entry.kind === "unfunded"
                  ? `url(#${unfundedPatternId})`
                  : entry.kind === "withdrawal"
                    ? `url(#${patternId(entry.band!)})`
                    : INCOME_BAND_COLORS[entry.band!]
              }
              stroke={
                entry.kind === "unfunded"
                  ? CHART_COLORS.shortfall
                  : entry.kind === "withdrawal"
                    ? INCOME_BAND_COLORS[entry.band!]
                    : undefined
              }
              radius={index === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
          {planned && (
            <ReferenceLine
              y={planned.monthly}
              ifOverflow="extendDomain"
              stroke={CHART_COLORS.planned}
              {...PLANNED_LINE_STYLE}
              label={{ value: planned.label, position: "insideTopRight", fontSize: 13, fill: CHART_COLORS.planned }}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-col gap-2 text-xs text-slate-700">
        {legendGroups.map((group) => (
          <div key={group.heading}>
            <p className="font-medium text-slate-600">{group.heading}</p>
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {group.items.map((entry) => (
                <li key={entry.dataKey} className="flex items-center gap-1.5">
                  <SeriesSwatch entry={entry} />
                  <span>{labels[entry.band!]}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {(unfunded.length > 0 || planned) && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {planned && (
              <li className="flex items-center gap-1.5">
                <svg aria-hidden="true" width={18} height={10} className="shrink-0">
                  <line
                    x1={0}
                    y1={5}
                    x2={18}
                    y2={5}
                    stroke={CHART_COLORS.planned}
                    strokeWidth={PLANNED_LINE_STYLE.strokeWidth}
                    strokeDasharray={PLANNED_LINE_STYLE.strokeDasharray}
                  />
                </svg>
                <span>{planned.label}</span>
              </li>
            )}
            {unfunded.map((entry) => (
              <li key={entry.dataKey} className="flex items-center gap-1.5">
                <SeriesSwatch entry={entry} />
                <span>{entry.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

interface IncomeTooltipProps extends TooltipContentProps {
  series: Series[];
  money: (value: number) => string;
  totalLabel: string;
  ageHeading: (age: unknown) => string;
}

/** Lists only the sources that pay at this age, so unused categories do not pad the tooltip. */
function IncomeTooltip({ active, payload, label, series, money, totalLabel, ageHeading }: IncomeTooltipProps) {
  if (!active || !payload?.length) return null;
  const entries = series
    .map((entry) => ({
      entry,
      value: Number(payload.find((item) => item.dataKey === entry.dataKey)?.value ?? 0),
    }))
    .filter(({ value }) => value > 0);
  const income = entries.filter(({ entry }) => entry.kind !== "unfunded");
  const unfunded = entries.find(({ entry }) => entry.kind === "unfunded");
  const total = income.reduce((sum, { value }) => sum + value, 0);
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 font-medium text-slate-800">{ageHeading(label)}</p>
      <ul className="flex flex-col gap-0.5">
        {income.map(({ entry, value }) => (
          <li key={entry.dataKey} className="flex items-center gap-1.5">
            <SeriesSwatch entry={entry} />
            <span>{entry.name}</span>
            <span className="ms-auto ps-3 tabular-nums">{money(value)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1 flex border-t border-slate-100 pt-1 font-medium text-slate-800">
        <span>{totalLabel}</span>
        <span className="ms-auto ps-3 tabular-nums">{money(total)}</span>
      </p>
      {unfunded && (
        <p className="mt-1 flex items-center gap-1.5 font-medium" style={{ color: CHART_COLORS.shortfall }}>
          <SeriesSwatch entry={unfunded.entry} />
          <span>{unfunded.entry.name}</span>
          <span className="ms-auto ps-3 tabular-nums">{money(unfunded.value)}</span>
        </p>
      )}
    </div>
  );
}
