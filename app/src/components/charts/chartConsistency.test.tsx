import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { cloneElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import type { BacktestWindow, MonteCarloFanPoint, NetIncomeYear, NetWorthPoint } from "../../domain";
import { renderWithProviders } from "../../test/renderWithProviders";
import { BacktestChart } from "./BacktestChart";
import { BACKTEST_COLOURS } from "./backtestColours";
import { ChartFrame } from "./ChartFrame";
import { CHART_COLORS } from "./chartPalette";
import { BacktestTable, FanTable, NetIncomeTable, NetWorthTable } from "./ChartTables";
import { ComparisonChart } from "./ComparisonChart";
import { INCOME_BAND_COLORS } from "./incomeBandColors";
import { MonteCarloFanChart } from "./MonteCarloFanChart";
import { NetIncomeChart } from "./NetIncomeChart";
import { NetWorthChart, NetWorthTooltip } from "./NetWorthChart";
import { useChartTexts } from "./useChartTexts";

// jsdom has no layout, so the real container draws nothing; give it a size.
vi.mock("recharts", async (importOriginal) => {
  const original = await importOriginal<typeof import("recharts")>();
  return {
    ...original,
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) =>
      cloneElement(children, { width: 600, height: 280 }),
  };
});

const netWorth: NetWorthPoint[] = [
  { age: 60, netWorth: 1_000_000 },
  { age: 70, netWorth: 1_400_000 },
  { age: 80, netWorth: 900_000 },
];
const fan: MonteCarloFanPoint[] = [
  { age: 60, yearsFromNow: 0, p10: 900_000, p50: 1_000_000, p90: 1_100_000 },
  { age: 90, yearsFromNow: 30, p10: 100_000, p50: 600_000, p90: 2_000_000 },
];
const netIncome: NetIncomeYear[] = [
  { age: 67, grossMonthly: 20_000, taxMonthly: 2_000, netMonthly: 18_000, taxableMonthly: 15_000 },
  { age: 68, grossMonthly: 22_000, taxMonthly: 3_000, netMonthly: 19_000, taxableMonthly: 16_000 },
];
const windows: BacktestWindow[] = [
  { startYear: 1990, endYear: 2020, funded: true, shortfallAge: null, finalNetWorth: 500_000, netWorth: [1, 2, 3] },
  { startYear: 2000, endYear: 2030, funded: false, shortfallAge: 85, finalNetWorth: 0, netWorth: [1, 2, 0] },
];

const NAME = "Chart name";
const DESCRIPTION = "Chart description";

function expectNamedImage(container: HTMLElement) {
  const svg = container.querySelector(".recharts-wrapper > svg.recharts-surface");
  expect(svg).not.toBeNull();
  expect(svg).toHaveAttribute("role", "img");
  expect(svg).toHaveAttribute("aria-label", NAME);
  expect(svg?.querySelector("title")?.textContent).toBe(NAME);
  expect(svg?.querySelector("desc")?.textContent).toBe(DESCRIPTION);
}

describe("chart accessibility", () => {
  it("names the net worth chart", () => {
    const { container } = render(
      <NetWorthChart name={NAME} description={DESCRIPTION} data={netWorth} currencySymbol="₪" />,
    );
    expectNamedImage(container);
  });

  it("names the comparison chart", () => {
    const { container } = render(
      <ComparisonChart
        name={NAME}
        description={DESCRIPTION}
        data={[{ age: 67, netMonthly: 10_000 }]}
        target={12_000}
        currencySymbol="₪"
        netLabel="Net"
        targetLabel="Planned"
      />,
    );
    expectNamedImage(container);
  });

  it("names the net income chart", () => {
    const { container } = render(
      <NetIncomeChart
        name={NAME}
        description={DESCRIPTION}
        data={netIncome}
        currencySymbol="₪"
        netLabel="Kept"
        taxLabel="Tax"
        plannedMonthly={15_000}
        plannedLabel="Planned"
      />,
    );
    expectNamedImage(container);
  });

  it("names the Monte Carlo fan chart", () => {
    const { container } = render(
      <MonteCarloFanChart
        name={NAME}
        description={DESCRIPTION}
        data={fan}
        drawdownStartAge={67}
        currencySymbol="₪"
        bandLabel="Range"
        medianLabel="Median"
      />,
    );
    expectNamedImage(container);
  });

  it("names the backtest chart", () => {
    const { container } = render(
      <BacktestChart
        name={NAME}
        description={DESCRIPTION}
        windows={windows}
        worstStartYear={2000}
        currentAge={60}
        drawdownStartAge={62}
        currencySymbol="₪"
      />,
    );
    expectNamedImage(container);
  });
});

describe("ChartFrame", () => {
  it("always shows the takeaway and switches between the chart and a table", async () => {
    renderWithProviders(
      <ChartFrame takeaway="The takeaway." table={<NetWorthTable points={netWorth} caption="Net worth by age" />}>
        <div>the chart</div>
      </ChartFrame>,
    );
    expect(await screen.findByText("The takeaway.")).toBeInTheDocument();
    expect(screen.getByText("the chart")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /table/i }));
    const table = screen.getByRole("table", { name: "Net worth by age" });
    expect(table).toBeInTheDocument();
    expect(screen.queryByText("the chart")).not.toBeInTheDocument();
    expect(screen.getByText("The takeaway.")).toBeInTheDocument();
    expect(table.querySelectorAll("tbody tr")).toHaveLength(netWorth.length);

    fireEvent.click(screen.getByRole("button", { name: /chart/i }));
    expect(screen.getByText("the chart")).toBeInTheDocument();
  });

  it("offers no switch when the chart has no table", async () => {
    renderWithProviders(
      <ChartFrame takeaway="Only a sentence.">
        <div>the chart</div>
      </ChartFrame>,
    );
    expect(await screen.findByText("Only a sentence.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("chart tables", () => {
  it("lists every point of each chart with column headers and row headers", async () => {
    renderWithProviders(
      <>
        <FanTable fan={fan} caption="Fan" />
        <NetIncomeTable years={netIncome} caption="Net income" />
        <BacktestTable windows={windows} caption="Backtest" />
      </>,
    );
    await screen.findByRole("table", { name: "Fan" });
    for (const [caption, rows] of [
      ["Fan", fan.length],
      ["Net income", netIncome.length],
      ["Backtest", windows.length],
    ] as const) {
      const table = screen.getByRole("table", { name: caption });
      expect(table.querySelectorAll("tbody tr")).toHaveLength(rows);
      expect(table.querySelectorAll("thead th").length).toBeGreaterThan(1);
      expect(table.querySelectorAll("tbody th[scope='row']")).toHaveLength(rows);
    }
  });

  it("shows every row and leaves the vertical scrolling to the page", async () => {
    const longRun = Array.from({ length: 40 }, (_, index) => ({ age: 60 + index, netWorth: 1_000_000 - index }));
    renderWithProviders(
      <>
        <NetWorthTable points={longRun} caption="Long net worth" />
        <FanTable
          fan={longRun.map((point) => ({ age: point.age, yearsFromNow: point.age - 60, p10: 1, p50: 2, p90: 3 }))}
          caption="Long fan"
        />
      </>,
    );
    await screen.findByRole("table", { name: "Long net worth" });
    for (const caption of ["Long net worth", "Long fan"]) {
      const table = screen.getByRole("table", { name: caption });
      expect(table.querySelectorAll("tbody tr")).toHaveLength(40);
      expect(table.closest(".overflow-auto, .overflow-y-auto, [class*='max-h-']")).toBeNull();
    }
  });
});

describe("chart captions and tooltips", () => {
  const captions = (container: HTMLElement) =>
    [...container.querySelectorAll("svg text")].map((node) => node.textContent);

  it("captions the age axis and the money axis of the net worth chart", () => {
    const { container } = render(
      <NetWorthChart name={NAME} description={DESCRIPTION} data={netWorth} currencySymbol="₪" />,
    );
    expect(captions(container)).toEqual(expect.arrayContaining(["Age", "Today's money"]));
  });

  it("captions the monthly charts as per month and the comparison's age axis as the retirement age", () => {
    const comparison = render(
      <ComparisonChart
        name={NAME}
        description={DESCRIPTION}
        data={[{ age: 67, netMonthly: 10_000 }]}
        target={null}
        currencySymbol="₪"
        netLabel="Net"
        targetLabel="Planned"
      />,
    );
    expect(captions(comparison.container)).toEqual(
      expect.arrayContaining(["Retirement age", "Per month, today's money"]),
    );
    comparison.unmount();

    const income = render(
      <NetIncomeChart
        name={NAME}
        description={DESCRIPTION}
        data={netIncome}
        currencySymbol="₪"
        netLabel="Kept"
        taxLabel="Tax"
      />,
    );
    expect(captions(income.container)).toEqual(expect.arrayContaining(["Age", "Per month, today's money"]));
  });

  it("captions the market simulation charts", () => {
    const fanChart = render(
      <MonteCarloFanChart
        name={NAME}
        description={DESCRIPTION}
        data={fan}
        drawdownStartAge={67}
        currencySymbol="₪"
        bandLabel="Range"
        medianLabel="Median"
      />,
    );
    expect(captions(fanChart.container)).toEqual(expect.arrayContaining(["Age", "Today's money"]));
    fanChart.unmount();

    const backtest = render(
      <BacktestChart
        name={NAME}
        description={DESCRIPTION}
        windows={windows}
        worstStartYear={2000}
        currentAge={60}
        drawdownStartAge={62}
        currencySymbol="₪"
      />,
    );
    expect(captions(backtest.container)).toEqual(expect.arrayContaining(["Age", "Today's money"]));
  });

  it("shows the age and what the savings are made of in the net worth tooltip", () => {
    const point = {
      age: 70,
      netWorth: 1_400_000,
      byKind: { pensionFund: 900_000, studyFund: 100_000, otherInvestments: 400_000 },
    };
    render(<NetWorthTooltip active payload={[{ payload: point }]} label={70} currencySymbol="₪" />);

    expect(screen.getByText("Age 70")).toBeInTheDocument();
    expect(screen.getByText("Pension Fund")).toBeInTheDocument();
    expect(screen.getByText("₪900,000")).toBeInTheDocument();
    expect(screen.getByText("Study Fund")).toBeInTheDocument();
    expect(screen.getByText("Investments (deposits, shares, cash)")).toBeInTheDocument();
    expect(screen.getByText("₪400,000")).toBeInTheDocument();
    expect(screen.getByText("Net worth")).toBeInTheDocument();
    expect(screen.getByText("₪1,400,000")).toBeInTheDocument();
    expect(screen.queryByText("Provident Fund")).not.toBeInTheDocument();
  });

  it("shows only the net worth in the tooltip when the point carries no split", () => {
    render(
      <NetWorthTooltip active payload={[{ payload: { age: 80, netWorth: 900_000 } }]} label={80} currencySymbol="₪" />,
    );

    expect(screen.getByText("Age 80")).toBeInTheDocument();
    expect(screen.getByText("₪900,000")).toBeInTheDocument();
    expect(screen.queryByText("Pension Fund")).not.toBeInTheDocument();
  });

  it("shows no tooltip when nothing is hovered", () => {
    const { container } = render(<NetWorthTooltip active={false} payload={[]} currencySymbol="₪" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("heads the comparison tooltip with the retirement age", () => {
    const { result } = renderHook(() => useChartTexts());
    expect(result.current.retireAtHeading(65)).toBe("Retiring at 65");
    expect(result.current.ageHeading(65)).toBe("Age 65");
  });
});

describe("chart palette", () => {
  it("uses red only for a shortfall", () => {
    const reds = [CHART_COLORS.shortfall, BACKTEST_COLOURS.short, BACKTEST_COLOURS.worst];
    const others = [
      CHART_COLORS.total,
      CHART_COLORS.muted,
      CHART_COLORS.planned,
      CHART_COLORS.marker,
      BACKTEST_COLOURS.funded,
      ...Object.values(INCOME_BAND_COLORS),
    ];
    for (const colour of others) expect(reds).not.toContain(colour);
  });

  it("draws the planned spending in the same colour in the comparison and net income charts", () => {
    const comparison = render(
      <ComparisonChart
        name={NAME}
        description={DESCRIPTION}
        data={[{ age: 67, netMonthly: 10_000 }]}
        target={12_000}
        currencySymbol="₪"
        netLabel="Net"
        targetLabel="Planned"
      />,
    );
    const comparisonLine = comparison.container.querySelector(".recharts-reference-line line");
    expect(comparisonLine).toHaveAttribute("stroke", CHART_COLORS.planned);
    expect(comparisonLine).toHaveAttribute("stroke-dasharray", "6 4");
    comparison.unmount();

    const income = render(
      <NetIncomeChart
        name={NAME}
        description={DESCRIPTION}
        data={netIncome}
        currencySymbol="₪"
        netLabel="Kept"
        taxLabel="Tax"
        plannedMonthly={15_000}
        plannedLabel="Planned"
      />,
    );
    const incomeLine = income.container.querySelector(".recharts-reference-line line");
    expect(incomeLine).toHaveAttribute("stroke", CHART_COLORS.planned);
    expect(incomeLine).toHaveAttribute("stroke-dasharray", "6 4");
  });
});
