import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

interface PasswordPromptProps {
  busy: boolean;
  /** Shown when the last password did not open the file. */
  errorMessage: string | null;
  onSubmit: (password: string) => void;
  onChooseOther: () => void;
}

export function PasswordPrompt({ busy, errorMessage, onSubmit, onChooseOther }: PasswordPromptProps) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password === "" || busy) return;
    const entered = password;
    setPassword("");
    onSubmit(entered);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700">{t("clearingHouse.password.title")}</h2>
      <p className="text-sm text-slate-600">{t("clearingHouse.password.body")}</p>
      <label className="flex flex-col gap-1 text-sm text-slate-700">
        {t("clearingHouse.password.label")}
        <input
          type="password"
          autoComplete="off"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      {busy && (
        <p role="status" className="text-sm text-slate-600">
          {t("clearingHouse.reading")}
        </p>
      )}
      {errorMessage && (
        <p role="alert" className="text-sm text-red-700">
          {errorMessage}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={busy || password === ""}
          className="rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {t("clearingHouse.password.submit")}
        </button>
        <button
          type="button"
          onClick={onChooseOther}
          className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          {t("clearingHouse.password.chooseOther")}
        </button>
      </div>
    </form>
  );
}
