import { useEffect } from "react";

interface ToastProps {
  message: string | null;
  onClear: () => void;
  /** Visual tone; "error" tints the toast for failure states (e.g. a bad import file). */
  tone?: "default" | "error";
}

/** Lightweight bottom-center toast for brief status notices. */
export function Toast({ message, onClear, tone = "default" }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onClear, 2500);
    return () => clearTimeout(timer);
  }, [message, onClear]);

  if (!message) return null;

  return (
    <div className="fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 md:bottom-6">
      <div
        className={`rounded-full px-4 py-2 text-sm text-white shadow-lg ${
          tone === "error" ? "bg-red-600" : "bg-slate-900"
        }`}
      >
        {message}
      </div>
    </div>
  );
}
