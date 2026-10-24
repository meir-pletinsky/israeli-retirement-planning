interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Optional list of suggestions shown via a native datalist; the field stays free text. */
  suggestions?: string[];
  /** Required (and must be unique on the page) when `suggestions` is provided. */
  suggestionsId?: string;
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  suggestions,
  suggestionsId,
}: TextFieldProps) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        list={suggestions ? suggestionsId : undefined}
        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:outline-none"
      />
      {suggestions && suggestionsId && (
        <datalist id={suggestionsId}>
          {suggestions.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      )}
    </label>
  );
}
