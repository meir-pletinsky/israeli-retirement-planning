import clsx from "clsx";
import type { ReactNode } from "react";

interface StatusBannerProps {
  /** `caution` is on track on average, but not dependably across the simulated markets. */
  status: "onTrack" | "caution" | "shortfall";
  message: string;
  /** Supporting lines under the message. */
  details?: ReactNode[];
  /** A link or button after the details. */
  action?: ReactNode;
}

export function StatusBanner({ status, message, details = [], action }: StatusBannerProps) {
  const isOnTrack = status === "onTrack";
  return (
    <div
      className={clsx(
        "flex items-start gap-3 rounded-xl border p-4",
        isOnTrack
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-amber-200 bg-amber-50 text-amber-800",
      )}
    >
      <span
        aria-hidden
        className={clsx(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
          isOnTrack
            ? "bg-emerald-200 text-emerald-800"
            : "bg-amber-200 text-amber-800",
        )}
      >
        {isOnTrack ? "✓" : "!"}
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm font-medium">{message}</p>
        {details.map((detail, index) => (
          <p key={index} className="text-sm">
            {detail}
          </p>
        ))}
        {action && <p className="text-sm font-medium">{action}</p>}
      </div>
    </div>
  );
}
