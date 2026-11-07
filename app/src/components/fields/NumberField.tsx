import { useId, type ReactNode } from "react";

import { FieldLabel, type FieldImportance } from "./FieldLabel";

interface NumberFieldProps {
  /** Lets a link from another screen open the page at this field. */
  id?: string;
  label: string;
  importance?: FieldImportance;
  helperText?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  suffix?: ReactNode;
  min?: number;
  max?: number;
  step?: number;
  /** Shown while the field is empty, e.g. the value used when none is entered. */
  placeholder?: string;
  error?: string;
}

export function NumberField({
  id,
  label,
  importance,
  helperText,
  value,
  onChange,
  suffix,
  min,
  max,
  step,
  placeholder,
  error,
}: NumberFieldProps) {
  const messageId = useId();
  const message = error ?? helperText;

  return (
    <div>
      <label className="block">
        <FieldLabel label={label} importance={importance} />
        <div
          className={`mt-1 flex items-center rounded-md border bg-white focus-within:border-brand-500 ${
            error ? "border-red-400" : "border-slate-300"
          }`}
        >
          <input
            id={id}
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step={step}
            placeholder={placeholder}
            value={value ?? ""}
            aria-required={importance === "required" || undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={message ? messageId : undefined}
            onChange={(e) =>
              onChange(e.target.value === "" ? null : Number(e.target.value))
            }
            className="w-full rounded-md px-3 py-2 text-sm text-slate-900 focus:outline-none"
          />
          {suffix && (
            <span className="pe-3 text-sm text-slate-400">{suffix}</span>
          )}
        </div>
      </label>
      {message && (
        <span
          id={messageId}
          className={`mt-1 block text-xs ${error ? "text-red-600" : "text-slate-400"}`}
        >
          {message}
        </span>
      )}
    </div>
  );
}
