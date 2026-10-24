import type { ReactNode } from "react";

interface NumberFieldProps {
  label: string;
  helperText?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  suffix?: ReactNode;
  min?: number;
  max?: number;
}

export function NumberField({
  label,
  helperText,
  value,
  onChange,
  suffix,
  min,
  max,
}: NumberFieldProps) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="mt-1 flex items-center rounded-md border border-slate-300 bg-white focus-within:border-teal-500">
        <input
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          value={value ?? ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : Number(e.target.value))
          }
          className="w-full rounded-md px-3 py-2 text-sm text-slate-900 focus:outline-none"
        />
        {suffix && (
          <span className="pe-3 text-sm text-slate-400">{suffix}</span>
        )}
      </div>
      {helperText && (
        <span className="mt-1 block text-xs text-slate-400">
          {helperText}
        </span>
      )}
    </label>
  );
}
