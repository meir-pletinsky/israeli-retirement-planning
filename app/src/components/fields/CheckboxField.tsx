import { FieldLabel, type FieldImportance } from "./FieldLabel";

interface CheckboxFieldProps {
  label: string;
  importance?: FieldImportance;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function CheckboxField({
  label,
  importance,
  checked,
  onChange,
}: CheckboxFieldProps) {
  return (
    <label className="flex items-start gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
      />
      <FieldLabel
        label={label}
        importance={importance}
        className="text-sm text-slate-700"
      />
    </label>
  );
}
