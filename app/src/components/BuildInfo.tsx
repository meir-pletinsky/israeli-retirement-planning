import { useTranslation } from "react-i18next";

import { BUILD_COMMIT, BUILD_TIME } from "../buildInfo";
import { formatDate } from "../i18n/formatters";

const REPO_URL = "https://github.com/meir-pletinsky/israeli-retirement-planning";

/** Keeps the date and time together, left to right, inside right-to-left text. */
const isolate = (text: string) => `\u2066${text}\u2069`;

/** The date written like every other date, then "HH:mm", in the viewer's time zone. */
function formatBuildTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const local = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${formatDate(local)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Which commit is deployed and when it was built, in small gray text. */
export function BuildInfo() {
  const { t } = useTranslation();
  const commit = BUILD_COMMIT.slice(0, 7);
  const built = formatBuildTime(BUILD_TIME);

  return (
    <p className="mt-8 text-center text-xs text-slate-400">
      {commit ? (
        <a
          href={`${REPO_URL}/commit/${BUILD_COMMIT}`}
          target="_blank"
          rel="noreferrer"
          className="hover:underline"
        >
          {t("common.buildVersion", { commit })}
        </a>
      ) : (
        t("common.buildVersionUnknown")
      )}
      {built && ` \u00b7 ${t("common.buildTime", { time: isolate(built) })}`}
    </p>
  );
}
