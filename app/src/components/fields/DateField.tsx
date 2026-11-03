import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { formatDate, isCompleteDateText, parseDate } from "../../domain/dates";
import { FieldLabel, type FieldImportance } from "./FieldLabel";

interface DateFieldProps {
  label: string;
  importance?: FieldImportance;
  /** The date as ISO text (yyyy-mm-dd). */
  value: string | null;
  onChange: (value: string | null) => void;
}

/**
 * A date typed day first as dd/mm/yyyy, whatever the browser's own language, with a calendar
 * button for picking it instead. The value stays ISO text. Other common ways of writing the date
 * are understood when the field is left, and a text that is not a date is dropped then.
 */
export function DateField({ label, importance, value, onChange }: DateFieldProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const shown = draft ?? (value ? formatDate(value) : "");
  const invalid = draft !== null && draft.trim() !== "" && parseDate(draft) === null;

  function handleChange(text: string) {
    setDraft(text);
    if (text.trim() === "") onChange(null);
    else if (isCompleteDateText(text.trim())) {
      const iso = parseDate(text);
      if (iso) onChange(iso);
    }
  }

  function handleBlur() {
    if (draft === null) return;
    if (draft.trim() === "") onChange(null);
    else {
      const iso = parseDate(draft);
      if (iso) onChange(iso);
    }
    setDraft(null);
  }

  function openPicker() {
    const input = picker.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      input.click();
    }
  }

  return (
    <div className="relative">
      <label className="block">
        <FieldLabel label={label} importance={importance} />
        <input
          type="text"
          inputMode="numeric"
          dir="ltr"
          autoComplete="off"
          placeholder="dd/mm/yyyy"
          value={shown}
          aria-invalid={invalid || undefined}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          className={`mt-1 w-full rounded-md border bg-white py-2 pe-10 ps-3 text-sm text-slate-900 focus:outline-none ${
            invalid ? "border-rose-400 focus:border-rose-500" : "border-slate-300 focus:border-brand-500"
          }`}
        />
      </label>
      <button
        type="button"
        onClick={openPicker}
        aria-label={`${t("common.pickDate")}: ${label}`}
        className="absolute bottom-1 end-2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      >
        <svg
          viewBox="0 0 20 20"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <rect x="3" y="4.5" width="14" height="12" rx="2" />
          <path d="M3 8h14M7 3v3M13 3v3" />
        </svg>
      </button>
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={value ?? ""}
        onChange={(e) => {
          setDraft(null);
          onChange(e.target.value === "" ? null : e.target.value);
        }}
        className="pointer-events-none absolute end-0 bottom-0 h-0 w-0 opacity-0"
      />
    </div>
  );
}
