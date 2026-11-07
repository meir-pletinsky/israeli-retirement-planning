import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import type { ShortfallLevers as ShortfallLeversData } from "../domain";
import { formatNumber } from "../i18n/formatters";
import { useFormatAge } from "./useFormatAge";

/** Keeps an interpolated number in its own bidi run, so it does not reorder inside Hebrew text. */
const isolate = (text: string) => `\u2066${text}\u2069`;

const LINK_CLASS = "font-semibold text-brand-700 hover:underline";

interface ShortfallLeversProps {
  levers: ShortfallLeversData;
}

/** The ways to close a shortfall, each one enough on its own, each linking to where it is changed. */
export function ShortfallLevers({ levers }: ShortfallLeversProps) {
  const { t } = useTranslation();
  const formatAge = useFormatAge();
  const money = (amount: number) => isolate(`${t("common.currencySymbol")}${formatNumber(amount)}`);
  const { spend, retire, save } = levers;

  return (
    <ul className="flex list-disc flex-col gap-1 ps-5 text-sm">
      {spend && (
        <li>
          <Link to="/my-data/expenses" className={LINK_CLASS}>
            {t("dashboard.levers.spend", { amount: money(Math.floor(spend.monthly)) })}
          </Link>{" "}
          {t("dashboard.levers.spendNote", { planned: money(Math.round(spend.planned)) })}
        </li>
      )}
      {retire && (
        <li>
          <a href="#feasibility-title" className={LINK_CLASS}>
            {t("dashboard.levers.retire", { age: isolate(formatAge(retire.age)) })}
          </a>{" "}
          {t("dashboard.levers.retireNote", { planned: isolate(formatAge(retire.plannedAge)) })}
          {retire.spouseAge !== null && (
            <>
              {" "}
              {t("dashboard.feasibility.bothRetire", {
                age: isolate(formatAge(retire.age)),
                spouseAge: isolate(formatAge(retire.spouseAge)),
              })}
            </>
          )}
        </li>
      )}
      {save && (
        <li>
          <Link to="/my-data/pension-savings" className={LINK_CLASS}>
            {t("dashboard.levers.save", { amount: money(save.monthly) })}
          </Link>{" "}
          {t("dashboard.levers.saveNote")}
        </li>
      )}
    </ul>
  );
}
