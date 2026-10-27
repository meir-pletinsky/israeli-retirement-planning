import { FieldLabel, type FieldImportance } from "./FieldLabel";

interface SelectFieldOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  label: string;
  importance?: FieldImportance;
  value: string | null;
  options: SelectFieldOption[];
  onChange: (value: string) => void;
}

export function SelectField({
  label,
  importance,
  value,
  options,
  onChange,
}: SelectFieldProps) {
  return (
    <label className="block">
      <FieldLabel label={label} importance={importance} />
      <select
        value={value ?? ""}
        aria-required={importance === "required" || undefined}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:outline-none"
      >
        <option value="" disabled>
          …
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
