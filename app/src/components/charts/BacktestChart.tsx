import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";

import type { BacktestWindow } from "../../domain";
import { BACKTEST_COLOURS } from "./backtestColours";
import { formatAxisMoney } from "./formatAxisMoney";

interface BacktestChartProps {
  windows: BacktestWindow[];
  /** The start year of the window to draw thicker. */
  worstStartYear: number;
  /** The primary user's age today. */
  currentAge: number;
  /** The age at which the household starts drawing, marked on the chart. */
  drawdownStartAge: number;
  currencySymbol: string;
}

const { funded: FUNDED_COLOUR, short: SHORT_COLOUR, worst: WORST_COLOUR } = BACKTEST_COLOURS;

/** Net worth from each historical starting year: one thin line each, red where spending ran short. */
export function BacktestChart({
  windows,
  worstStartYear,
  currentAge,
  drawdownStartAge,
  currencySymbol,
}: BacktestChartProps) {
  const points = (windows[0]?.netWorth ?? []).map((_, yearsFromNow) => {
    const point: Record<string, number> = { age: currentAge + yearsFromNow };
    for (const window of windows) point[`y${window.startYear}`] = window.netWorth[yearsFromNow];
    return point;
  });
  // Drawn funded first, then short, then the hardest start, so the problem lines sit on top.
  const ordered = [
    ...windows.filter((window) => window.funded),
    ...windows.filter((window) => !window.funded && window.startYear !== worstStartYear),
    ...windows.filter((window) => window.startYear === worstStartYear),
  ];

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="age" tick={{ fontSize: 12 }} stroke="#94a3b8" />
        <YAxis
          tick={{ fontSize: 12 }}
          stroke="#94a3b8"
          tickFormatter={(value: number) => formatAxisMoney(value, currencySymbol)}
        />
        <ReferenceLine x={drawdownStartAge} stroke="#0b6e99" strokeDasharray="4 4" />
        {ordered.map((window) => {
          const worst = window.startYear === worstStartYear;
          return (
            <Line
              key={window.startYear}
              type="monotone"
              dataKey={`y${window.startYear}`}
              stroke={worst ? WORST_COLOUR : window.funded ? FUNDED_COLOUR : SHORT_COLOUR}
              strokeWidth={worst ? 2.5 : 1}
              strokeOpacity={worst ? 1 : window.funded ? 0.55 : 0.8}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
          );
        })}
      </LineChart>
    </ResponsiveContainer>
  );
}
