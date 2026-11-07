import clsx from "clsx";
import type { ReactNode } from "react";

interface StatusBannerProps {
  /**
   * `caution` is on track on average, but not dependably across the simulated markets.
   * `checking` is the same check still running.
   */
  status: "onTrack" | "caution" | "shortfall" | "checking";
  message: string;
  /** Supporting lines under the message. */
  details?: ReactNode[];
  /** Block content (such as a list) after the details. */
  children?: ReactNode;
  /** A link or button after the details. */
  action?: ReactNode;
}

export function StatusBanner({ status, message, details = [], children, action }: StatusBannerProps) {
  const isOnTrack = status === "onTrack";
  const isChecking = status === "checking";
  return (
    <div
      className={clsx(
        "flex items-start gap-3 rounded-xl border p-4",
        isChecking
          ? "border-slate-200 bg-slate-50 text-slate-700"
          : isOnTrack
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-amber-200 bg-amber-50 text-amber-800",
      )}
    >
      <span
        aria-hidden
        className={clsx(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
          isChecking
            ? "bg-slate-200 text-slate-700"
            : isOnTrack
              ? "bg-emerald-200 text-emerald-800"
              : "bg-amber-200 text-amber-800",
        )}
      >
        {isChecking ? "…" : isOnTrack ? "✓" : "!"}
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm font-medium">{message}</p>
        {details.map((detail, index) => (
          <p key={index} className="text-sm">
            {detail}
          </p>
        ))}
        {children}
        {action && <p className="text-sm font-medium">{action}</p>}
      </div>
    </div>
  );
}
