import type { ReactNode } from "react";

interface FormModalProps {
  open: boolean;
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  /** Pinned under the title, outside the scrolling form. */
  note?: ReactNode;
}

export function FormModal({
  open,
  title,
  closeLabel,
  onClose,
  children,
  footer,
  note,
}: FormModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            &#x2715;
          </button>
        </div>
        {note && <div className="border-b border-slate-200 px-6 py-3">{note}</div>}
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
        <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
          {footer}
        </div>
      </div>
    </div>
  );
}
