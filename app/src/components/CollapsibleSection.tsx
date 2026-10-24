import { useState, type ReactNode } from "react";

interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-md border border-slate-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-start text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <span>{title}</span>
        <span aria-hidden="true" className="text-slate-400">
          {open ? "\u25be" : "\u25b8"}
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-4 border-t border-slate-200 p-4">
          {children}
        </div>
      )}
    </div>
  );
}
