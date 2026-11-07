import { useEffect, useRef, type ReactNode } from "react";

interface MoreDetailProps {
  /** What the collapsed block holds, in a few words. */
  summary: string;
  children: ReactNode;
}

/**
 * A collapsed block for the cards that matter less at first reading. A link or an address that
 * points at something inside it opens it first, so no anchor on the page stops working.
 */
export function MoreDetail({ summary, children }: MoreDetailProps) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const reveal = () => {
      const details = ref.current;
      const id = decodeURIComponent(window.location.hash.slice(1));
      const target = id ? document.getElementById(id) : null;
      if (!details || !target || !details.contains(target) || details.open) return;
      details.open = true;
      target.scrollIntoView?.();
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, []);

  return (
    <details ref={ref} className="group rounded-xl border border-slate-200 bg-white shadow-sm">
      <summary className="cursor-pointer list-none p-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="me-2 text-slate-400">
          <span className="group-open:hidden">{"\u25b8"}</span>
          <span className="hidden group-open:inline">{"\u25be"}</span>
        </span>
        {summary}
      </summary>
      <div className="flex flex-col gap-6 border-t border-slate-200 p-4">{children}</div>
    </details>
  );
}
