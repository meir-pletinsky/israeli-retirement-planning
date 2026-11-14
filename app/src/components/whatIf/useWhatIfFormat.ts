import { useTranslation } from "react-i18next";

import type { WhatIfSliderKey } from "../../domain";
import { formatNumber } from "../../i18n/formatters";

const MINUS = "\u2212";

/** How the what-if panel writes its values: ages, rates, moves in percent and money. */
export function useWhatIfFormat() {
  const { t } = useTranslation();
  const currencySymbol = t("common.currencySymbol");

  const money = (amount: number) =>
    `${amount < 0 ? MINUS : ""}${currencySymbol}${formatNumber(Math.abs(Math.round(amount)))}`;
  /** Money with an explicit plus or minus, for a change. */
  const signedMoney = (amount: number) => {
    const rounded = Math.round(amount);
    return rounded === 0 ? money(0) : `${rounded > 0 ? "+" : MINUS}${currencySymbol}${formatNumber(Math.abs(rounded))}`;
  };
  const rate = (value: number) => `${formatNumber(value, { maximumFractionDigits: 1 })}%`;
  const signedPercent = (value: number) =>
    value === 0 ? "0%" : `${value > 0 ? "+" : MINUS}${formatNumber(Math.abs(value), { maximumFractionDigits: 1 })}%`;
  const signedNumber = (value: number) =>
    value === 0 ? "0" : `${value > 0 ? "+" : MINUS}${formatNumber(Math.abs(value), { maximumFractionDigits: 1 })}`;

  const value = (key: WhatIfSliderKey, amount: number): string => {
    switch (key) {
      case "retirementAge":
      case "spouseRetirementAge":
      case "pensionStartAge":
      case "spousePensionStartAge":
        return String(amount);
      case "investmentReturnPct":
      case "inflationPct":
      case "incomeCapPct":
        return rate(amount);
      case "monthlySpending":
        return money(amount);
      case "sharesChangePct":
      case "dollarChangePct":
        return signedPercent(amount);
    }
  };

  const label = (key: WhatIfSliderKey) => t(`whatIf.param.${key}`);

  return { money, signedMoney, rate, signedPercent, signedNumber, value, label };
}
