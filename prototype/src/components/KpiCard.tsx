import clsx from "clsx";
import type { ReactNode } from "react";

interface KpiCardProps {
  label: string;
  value: ReactNode;
  status?: "positive" | "negative" | "neutral";
}

const STATUS_CLASSES: Record<NonNullable<KpiCardProps["status"]>, string> = {
  positive: "text-emerald-600",
  negative: "text-amber-600",
  neutral: "text-slate-900",
};

export function KpiCard({ label, value, status = "neutral" }: KpiCardProps) {
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
    </div>
  );
}
