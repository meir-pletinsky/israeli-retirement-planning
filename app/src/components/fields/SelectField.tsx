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
        className="field-control mt-1.5 h-11 w-full px-3 focus:outline-none"
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
