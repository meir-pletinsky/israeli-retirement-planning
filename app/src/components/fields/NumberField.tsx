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
          className={`field-control mt-1.5 flex h-11 items-center ${
            error ? "border-red-600 ring-3 ring-red-500/15" : ""
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
            className="h-full w-full rounded-lg bg-transparent px-3 text-base text-slate-900 focus:outline-none md:text-sm"
          />
          {suffix && (
            <span className="pe-3 text-sm font-medium text-slate-500">{suffix}</span>
          )}
        </div>
      </label>
      {message && (
        <span
          id={messageId}
          className={`mt-1 block text-xs ${error ? "text-red-700" : "text-slate-500"}`}
        >
          {message}
        </span>
      )}
    </div>
  );
}
