import { useId } from "react";

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** `new-password` for a passphrase being chosen, `current-password` for one being entered. */
  autoComplete: "new-password" | "current-password";
  helperText?: string;
  error?: string | null;
  autoFocus?: boolean;
}

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  helperText,
  error,
  autoFocus = false,
}: PasswordFieldProps) {
  const messageId = useId();
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || helperText ? messageId : undefined}
        data-autofocus={autoFocus ? "" : undefined}
        className="field-control mt-1.5 h-11 w-full px-3 focus:outline-none"
      />
      {error ? (
        <span id={messageId} role="alert" className="mt-1.5 block text-xs text-red-700">
          {error}
        </span>
      ) : (
        helperText && (
          <span id={messageId} className="mt-1.5 block text-xs text-slate-500">
            {helperText}
          </span>
        )
      )}
    </label>
  );
}
