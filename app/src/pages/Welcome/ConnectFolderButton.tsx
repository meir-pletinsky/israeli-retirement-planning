import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useFolderSync, type ChosenFolder } from "../../app/folderSync";
import { BackupFolderSetupDialog } from "../../components/BackupFolderSetupDialog";

type Problem = "empty" | "unreadable" | "failed";

const PROBLEM_KEYS: Record<Problem, string> = {
  empty: "welcome.connectFolderEmpty",
  unreadable: "settings.sync.setup.unreadable",
  failed: "settings.sync.pickFailed",
};

/**
 * Lets a returning user start from the backups in a folder: picks the folder, connects it, and then the
 * app's own question (`SyncPromptDialog`) offers to load the newest backup. A folder without a backup is
 * turned down here, because there is nothing to start from.
 */
export function ConnectFolderButton() {
  const { t } = useTranslation();
  const { chooseFolder } = useFolderSync();
  const [chosen, setChosen] = useState<ChosenFolder | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);

  async function pickFolder() {
    setProblem(null);
    try {
      const picked = await chooseFolder();
      if (!picked) return;
      if (picked.head || picked.newerFormat) setChosen(picked);
      else setProblem(picked.unreadable > 0 ? "unreadable" : "empty");
    } catch {
      setProblem("failed");
    }
  }

  return (
    <>
      <button type="button" onClick={() => void pickFolder()} className="btn btn-secondary min-h-12 text-base">
        {t("welcome.connectFolder")}
      </button>
      {problem && (
        <p role="alert" className="text-sm text-red-700">
          {t(PROBLEM_KEYS[problem])}
        </p>
      )}
      {chosen && <BackupFolderSetupDialog restore chosen={chosen} onClose={() => setChosen(null)} />}
    </>
  );
}
