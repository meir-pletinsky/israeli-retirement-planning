import { useTranslation } from "react-i18next";

import { MIN_PASSPHRASE_LENGTH, passphraseProblem } from "../app/folderSync";
import { PasswordField } from "./fields/PasswordField";

interface NewPassphraseFieldsProps {
  passphrase: string;
  confirmation: string;
  onPassphraseChange: (value: string) => void;
  onConfirmationChange: (value: string) => void;
  /** Show what is wrong; held back until the user tried to continue. */
  showProblem: boolean;
  autoFocus?: boolean;
}

/** The two fields for choosing the passphrase that seals the backups. */
export function NewPassphraseFields({
  passphrase,
  confirmation,
  onPassphraseChange,
  onConfirmationChange,
  showProblem,
  autoFocus,
}: NewPassphraseFieldsProps) {
  const { t } = useTranslation();
  const problem = showProblem ? passphraseProblem(passphrase, confirmation) : null;

  return (
    <div className="flex flex-col gap-3">
      <PasswordField
        label={t("settings.sync.passphrase.label")}
        value={passphrase}
        onChange={onPassphraseChange}
        autoComplete="new-password"
        autoFocus={autoFocus}
        helperText={t("settings.sync.passphrase.rules", { min: MIN_PASSPHRASE_LENGTH })}
        error={problem === "short" ? t("settings.sync.passphrase.tooShort", { min: MIN_PASSPHRASE_LENGTH }) : null}
      />
      <PasswordField
        label={t("settings.sync.passphrase.confirm")}
        value={confirmation}
        onChange={onConfirmationChange}
        autoComplete="new-password"
        error={problem === "mismatch" ? t("settings.sync.passphrase.mismatch") : null}
      />
      <p className="text-xs text-slate-600">{t("settings.sync.passphrase.lossWarning")}</p>
    </div>
  );
}
