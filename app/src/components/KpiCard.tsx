import clsx from "clsx";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useMediaQuery } from "../app/useMediaQuery";

interface KpiCardProps {
  label: string;
  value: ReactNode;
  status?: "positive" | "negative" | "neutral";
  /** Text or short lines under the value that qualify it, such as the age it starts at. */
  note?: ReactNode;
}

const STATUS_CLASSES: Record<NonNullable<KpiCardProps["status"]>, string> = {
  positive: "text-emerald-700",
  negative: "text-amber-700",
  neutral: "text-slate-900",
};

const STATUS_EDGE: Record<NonNullable<KpiCardProps["status"]>, string> = {
  positive: "before:bg-emerald-600",
  negative: "before:bg-amber-500",
  neutral: "before:bg-transparent",
};

export function KpiCard({ label, value, status = "neutral", note }: KpiCardProps) {
  const { t } = useTranslation();
  const phone = useMediaQuery("(width < 40rem)");
  const noteClass = "text-xs leading-snug text-slate-500 [&_p:first-child]:text-slate-700 [&_p]:mt-1 [&_p:first-child]:mt-0";
  return (
    <div className={clsx(
      "relative flex h-full flex-col rounded-[var(--radius-card)] border border-slate-200 bg-white p-4 shadow-sm sm:p-5 before:absolute before:inset-x-0 before:top-0 before:h-1 before:rounded-t-[var(--radius-card)]",
      STATUS_EDGE[status],
    )}>
      <p className="text-sm font-medium leading-snug text-slate-600 sm:min-h-[2.75rem]">{label}</p>
      <p
        className={clsx(
          "mt-1 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl",
          STATUS_CLASSES[status],
        )}
      >
        {value}
      </p>
      {note && (phone ? (
        <details className="mt-3 border-t border-slate-100 pt-2">
          <summary className="cursor-pointer text-xs font-semibold text-brand-700">
            {t("myData.summary.moreDetails")}
          </summary>
          <div className={clsx("mt-2", noteClass)}>{note}</div>
        </details>
      ) : (
        <div className={clsx("mt-4 border-t border-slate-100 pt-3", noteClass)}>
          {note}
        </div>
      ))}
    </div>
  );
}
