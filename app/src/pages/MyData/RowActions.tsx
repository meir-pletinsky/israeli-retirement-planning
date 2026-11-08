import { useTranslation } from "react-i18next";

interface RowActionsProps {
  /** Id of the table cell that names the row, read out after each button's label. */
  describedBy: string;
  onEdit: () => void;
  onRemove: () => void;
}

/** Edit and Remove as quiet icon buttons; the destructive colour appears only on hover. */
export function RowActions({ describedBy, onEdit, onRemove }: RowActionsProps) {
  const { t } = useTranslation();
  const base = "btn btn-sm h-8 w-8 p-0 text-slate-500";
  return (
    <div className="flex justify-end gap-0.5">
      <button type="button" aria-describedby={describedBy} onClick={onEdit} title={t("common.edit")} className={`${base} hover:bg-brand-50 hover:text-brand-700 focus-visible:bg-brand-50 focus-visible:text-brand-700`}>
        <span className="sr-only">{t("common.edit")}</span>
        <svg aria-hidden viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
      </button>
      <button type="button" aria-describedby={describedBy} onClick={onRemove} title={t("common.remove")} className={`${base} hover:bg-red-50 hover:text-red-700 focus-visible:bg-red-50 focus-visible:text-red-700`}>
        <span className="sr-only">{t("common.remove")}</span>
        <svg aria-hidden viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /></svg>
      </button>
    </div>
  );
}
