import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";

import { ALWAYS_ALLOW_OPTION, useFolderSync } from "../app/folderSync";

/**
 * Tells the user when the backup folder needs them: the browser wants a click before the app may
 * use the folder again, a choice between versions is waiting, or the folder is gone. Short-lived
 * trouble is left to Settings, and Settings itself shows the full state.
 */
export function BackupFolderNotice() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { status, problem, permission, reconnect, reviewCloudVersion } = useFolderSync();

  if (pathname === "/settings") return null;

  let message: string | null = null;
  let action: { label: string; onClick: () => void } | "settings" | null = null;

  if (status === "needsPermission") {
    message = t("settings.sync.notice.needsPermission");
    action =
      permission === "prompt"
        ? { label: t("settings.sync.allowAccess"), onClick: () => void reconnect() }
        : "settings";
  } else if (status === "paused") {
    message = t("settings.sync.notice.paused");
    action = { label: t("settings.sync.review"), onClick: reviewCloudVersion };
  } else if (status === "error" && (problem === "permission" || problem === "missing" || problem === "newerFormat")) {
    message = t(`settings.sync.problem.${problem}`);
    action = "settings";
  }

  if (!message || !action) return null;

  const permissionPrompt = status === "needsPermission" && permission === "prompt";

  return (
    <div role="status" className="notice border-amber-200 bg-amber-50 shadow-sm">
      <span aria-hidden className="notice-icon hidden bg-amber-100 text-amber-800 sm:flex">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></svg>
      </span>
      <div className="flex-1">
        <p className="text-sm text-amber-900">{message}</p>
        {permissionPrompt && (
          <p className="mt-1 text-xs text-amber-800">{t("settings.sync.allowHint", { option: ALWAYS_ALLOW_OPTION })}</p>
        )}
      </div>
      {action === "settings" ? (
        <Link to="/settings" className="btn btn-sm btn-secondary">
          {t("settings.sync.notice.openSettings")}
        </Link>
      ) : (
        <button type="button" onClick={action.onClick} className="btn btn-sm btn-primary">
          {action.label}
        </button>
      )}
    </div>
  );
}
