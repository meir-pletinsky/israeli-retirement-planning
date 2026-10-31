import { useTranslation } from "react-i18next";

interface RowActionsProps {
  /** Id of the table cell that names the row, read out after each button's label. */
  describedBy: string;
  onEdit: () => void;
  onRemove: () => void;
}

/** The Edit and Remove buttons at the end of a My Data table row. */
export function RowActions({ describedBy, onEdit, onRemove }: RowActionsProps) {
  const { t } = useTranslation();
  return (
    <div className="flex justify-end gap-1">
      <button
        type="button"
        aria-describedby={describedBy}
        onClick={onEdit}
        className="rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
      >
        {t("common.edit")}
      </button>
      <button
        type="button"
        aria-describedby={describedBy}
        onClick={onRemove}
        className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
      >
        {t("common.remove")}
      </button>
    </div>
  );
}
