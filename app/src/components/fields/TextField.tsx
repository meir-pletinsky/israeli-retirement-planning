import { FieldLabel, type FieldImportance } from "./FieldLabel";

export interface TextSuggestion {
  value: string;
  /** Shown next to the value in the browser's suggestion list (for example a company name). */
  label?: string;
}

interface TextFieldProps {
  label: string;
  importance?: FieldImportance;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Short hint shown under the input. */
  helperText?: string;
  /** Optional list of suggestions shown via a native datalist; the field stays free text. */
  suggestions?: Array<string | TextSuggestion>;
  /** Required (and must be unique on the page) when `suggestions` is provided. */
  suggestionsId?: string;
}

export function TextField({
  label,
  importance,
  value,
  onChange,
  placeholder,
  helperText,
  suggestions,
  suggestionsId,
}: TextFieldProps) {
  return (
    <label className="block">
      <FieldLabel label={label} importance={importance} />
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        list={suggestions ? suggestionsId : undefined}
        className="field-control mt-1.5 h-11 w-full px-3 focus:outline-none"
      />
      {helperText && (
        <span className="mt-1.5 block text-xs text-slate-500">{helperText}</span>
      )}
      {suggestions && suggestionsId && (
        <datalist id={suggestionsId}>
          {suggestions.map((option) => {
            const { value: optionValue, label: optionLabel } =
              typeof option === "string" ? { value: option, label: undefined } : option;
            return <option key={optionValue} value={optionValue} label={optionLabel} />;
          })}
        </datalist>
      )}
    </label>
  );
}
