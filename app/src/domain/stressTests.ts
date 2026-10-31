import type { ProfileData, StockHolding } from "../types";
import { desiredRetirementMonthly } from "./expenses";
import { buildHousehold, resolveRetirementTiming, selfProfileView, type RetirementTiming } from "./household";
import { estimateNetIncomeForHousehold } from "./netIncome";
import { holdingValueIls, resolveCurrentAge, usdToIlsRate } from "./profileBasics";
import { estimateHouseholdRetirementIncome } from "./retirementIncome";
import { engineNowMs } from "./trace";
import type { RetirementScenario } from "./types";
import { momentAfterYears, quantityAtRetirement } from "./vesting";

/** How far the employer shares' price falls in each employer-stock stress, in percent. */
export const STRESS_EMPLOYER_STOCK_DROPS_PCT = [30, 50] as const;
/** How far the dollar falls against the shekel in each dollar stress, in percent. */
export const STRESS_DOLLAR_DROPS_PCT = [10, 20] as const;
/** The one row where both go wrong together. */
export const STRESS_COMBINED = { employerStockPct: 50, dollarPct: 20 } as const;

export type StressKind = "employerStock" | "dollar" | "both";

/** What the plan gives in one situation, in today's money. */
export interface StressOutcome {
  /** Savings when the household starts drawing. */
  netWorthAtRetirement: number;
  /** The lowest net monthly income of any retirement year, as on the Dashboard. */
  netMonthlyIncome: number;
  /** Net income minus the desired monthly spending; null when no spending is entered. */
  monthlyGap: number | null;
}

/** One stress: how far each thing falls, the plan's outcome then, and the change from the plan as it is. */
export interface StressRow extends StressOutcome {
  kind: StressKind;
  /** Percent the employer shares' price falls; 0 when this stress leaves them alone. */
  employerStockDropPct: number;
  /** Percent the dollar falls against the shekel; 0 when this stress leaves it alone. */
  dollarDropPct: number;
  /** Savings at retirement minus the plan's own; negative when the stress costs money. */
  netWorthChange: number;
  /** The same as a percent of the plan's savings; null when the plan has none. */
  netWorthChangePercent: number | null;
  netMonthlyChange: number;
  netMonthlyChangePercent: number | null;
}

export interface StressTest {
  /** The desired monthly spending in retirement, or null when none is entered. */
  desiredMonthly: number | null;
  /** What the household's dollar-priced holdings would be worth in shekels at retirement, at today's prices and rate. */
  dollarValue: number;
  /** The employer shares among them (company grants and ESPP shares). */
  employerValue: number;
  /** The plan with nothing going wrong. */
  base: StressOutcome;
  rows: StressRow[];
}

/** Employer shares: the company's grants and the shares bought through its ESPP. */
export function isEmployerStock(holding: StockHolding): boolean {
  return (
    holding.investmentCategory === "employerGrantedStock" ||
    holding.investmentCategory === "employerEsppDiscount"
  );
}

/**
 * The holding with its price down by `dropPct` percent. A holding without purchase lots states
 * its gain in dollars, so that gain falls by the same dollars per share and the tax follows;
 * lots and employer grants work the gain out from the price, so they need no change.
 */
function withPriceDrop(holding: StockHolding, dropPct: number): StockHolding {
  const price = holding.currentMarketPriceUSD;
  if (typeof price !== "number" || price <= 0) return holding;
  const lostPerShare = price * (dropPct / 100);
  const details = holding.personalPurchaseDetails;
  const gain = details.unrealizedCapitalGainUSD;
  return {
    ...holding,
    currentMarketPriceUSD: price - lostPerShare,
    personalPurchaseDetails:
      typeof gain === "number"
        ? { ...details, unrealizedCapitalGainUSD: gain - (holding.quantity ?? 0) * lostPerShare }
        : details,
  };
}

/** A copy of `profile` with the employer shares' price and the dollar rate down by the given percents. */
function stressedProfile(
  profile: ProfileData,
  employerStockDropPct: number,
  dollarDropPct: number,
): ProfileData {
  return {
    ...profile,
    equity: {
      ...profile.equity,
      usdToIlsRate:
        dollarDropPct > 0 ? usdToIlsRate(profile) * (1 - dollarDropPct / 100) : profile.equity.usdToIlsRate,
      holdings:
        employerStockDropPct > 0
          ? profile.equity.holdings.map((holding) =>
              isEmployerStock(holding) ? withPriceDrop(holding, employerStockDropPct) : holding,
            )
          : profile.equity.holdings,
    },
  };
}

function outcomeFor(
  profile: ProfileData,
  timing: RetirementTiming,
  desiredMonthly: number | null,
): StressOutcome {
  const household = buildHousehold(profile, timing);
  const { netWorthAtRetirement } = estimateHouseholdRetirementIncome(household);
  const { netMonthlyIncome } = estimateNetIncomeForHousehold(household);
  return {
    netWorthAtRetirement,
    netMonthlyIncome,
    monthlyGap: desiredMonthly === null ? null : Math.round(netMonthlyIncome - desiredMonthly),
  };
}

const changePercent = (change: number, base: number): number | null =>
  base > 0 ? (change / base) * 100 : null;

/**
 * Runs the plan again with one thing going wrong, and reports what it does to the savings at
 * retirement and to the lowest net monthly income: the employer shares losing part of their
 * price, the dollar losing part of its value against the shekel, and both at once. Every
 * stress is a full run of the plan, so the income is again what the savings can sustain, and
 * the tax is worked out afresh on the smaller gains.
 *
 * Only the shares and dollar holdings the household would still have at retirement count, so
 * unvested shares that would be lost are left out. Shares the person bought through a broker
 * are not employer shares, even in the same company. Returns null when there are no dollar
 * holdings to stress. Read-only: it changes none of the plan's numbers.
 */
export function buildStressTest(
  profile: ProfileData,
  scenario: RetirementScenario = "standard",
): StressTest | null {
  const timing = resolveRetirementTiming(profile, scenario);
  const yearsToLeave = Math.max(timing.selfAge - resolveCurrentAge(selfProfileView(profile)), 0);
  const retirementMs = momentAfterYears(engineNowMs(), yearsToLeave);
  const rate = usdToIlsRate(profile);

  let dollarValue = 0;
  let employerValue = 0;
  for (const holding of profile.equity.holdings) {
    const value = holdingValueIls(holding, rate, quantityAtRetirement(holding, retirementMs));
    dollarValue += value;
    if (isEmployerStock(holding)) employerValue += value;
  }
  if (dollarValue < 0.5) return null;

  const spending = desiredRetirementMonthly(profile.expenses);
  const desiredMonthly = spending !== null && spending > 0 ? spending : null;
  const base = outcomeFor(profile, timing, desiredMonthly);

  const hasEmployerStock = employerValue >= 0.5;
  const stresses: { kind: StressKind; employerStockDropPct: number; dollarDropPct: number }[] = [
    ...(hasEmployerStock
      ? STRESS_EMPLOYER_STOCK_DROPS_PCT.map((pct) => ({
          kind: "employerStock" as const,
          employerStockDropPct: pct,
          dollarDropPct: 0,
        }))
      : []),
    ...STRESS_DOLLAR_DROPS_PCT.map((pct) => ({
      kind: "dollar" as const,
      employerStockDropPct: 0,
      dollarDropPct: pct,
    })),
    ...(hasEmployerStock
      ? [
          {
            kind: "both" as const,
            employerStockDropPct: STRESS_COMBINED.employerStockPct,
            dollarDropPct: STRESS_COMBINED.dollarPct,
          },
        ]
      : []),
  ];

  const rows = stresses.map((stress): StressRow => {
    const outcome = outcomeFor(
      stressedProfile(profile, stress.employerStockDropPct, stress.dollarDropPct),
      timing,
      desiredMonthly,
    );
    const netWorthChange = outcome.netWorthAtRetirement - base.netWorthAtRetirement;
    const netMonthlyChange = outcome.netMonthlyIncome - base.netMonthlyIncome;
    return {
      ...stress,
      ...outcome,
      netWorthChange,
      netWorthChangePercent: changePercent(netWorthChange, base.netWorthAtRetirement),
      netMonthlyChange,
      netMonthlyChangePercent: changePercent(netMonthlyChange, base.netMonthlyIncome),
    };
  });

  return {
    desiredMonthly,
    dollarValue: Math.round(dollarValue),
    employerValue: Math.round(employerValue),
    base,
    rows,
  };
}
