import clsx from "clsx";

interface StatusBannerProps {
  status: "onTrack" | "shortfall";
  message: string;
}

export function StatusBanner({ status, message }: StatusBannerProps) {
  const isOnTrack = status === "onTrack";
  return (
    <div
      className={clsx(
        "flex items-center gap-3 rounded-xl border p-4",
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
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}
