import clsx from "clsx";
import type { ReactNode } from "react";

interface KpiCardProps {
  label: string;
  value: ReactNode;
  status?: "positive" | "negative" | "neutral";
  /** A short line under the value that qualifies it, such as the age it starts at. */
  note?: ReactNode;
}

const STATUS_CLASSES: Record<NonNullable<KpiCardProps["status"]>, string> = {
  positive: "text-emerald-600",
  negative: "text-amber-600",
  neutral: "text-slate-900",
};

export function KpiCard({ label, value, status = "neutral", note }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p
        className={clsx(
          "mt-2 text-2xl font-semibold tabular-nums",
          STATUS_CLASSES[status],
        )}
      >
        {value}
      </p>
      {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
    </div>
  );
}
