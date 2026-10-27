import { FieldLabel, type FieldImportance } from "./FieldLabel";

interface DateFieldProps {
  label: string;
  importance?: FieldImportance;
  value: string | null;
  onChange: (value: string | null) => void;
}

export function DateField({ label, importance, value, onChange }: DateFieldProps) {
  return (
    <label className="block">
      <FieldLabel label={label} importance={importance} />
      <input
        type="date"
        value={value ?? ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : e.target.value)
        }
        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:outline-none"
      />
    </label>
  );
}
