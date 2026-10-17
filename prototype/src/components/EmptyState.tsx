import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  body: string;
  action?: ReactNode;
}

export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
      <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
      <p className="max-w-sm text-sm text-slate-500">{body}</p>
      {action}
    </div>
  );
}
