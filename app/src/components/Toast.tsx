import { useEffect } from "react";

interface ToastProps {
  message: string | null;
  onClear: () => void;
}

/** Lightweight bottom-center toast, used for prototype-only "not implemented" notices. */
export function Toast({ message, onClear }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onClear, 2500);
    return () => clearTimeout(timer);
  }, [message, onClear]);

  if (!message) return null;

  return (
    <div className="fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 md:bottom-6">
      <div className="rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
        {message}
      </div>
    </div>
  );
}
