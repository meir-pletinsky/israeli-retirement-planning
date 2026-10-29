import { useState, type ChangeEvent, type DragEvent } from "react";
import { useTranslation } from "react-i18next";

const SITE_URL = "https://swiftness.co.il";

interface PickStageProps {
  busy: boolean;
  errorMessage: string | null;
  onFiles: (files: File[]) => void;
}

export function PickStage({ busy, errorMessage, onFiles }: PickStageProps) {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length > 0) onFiles(files);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) onFiles(files);
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">{t("clearingHouse.instructions.title")}</h2>
        <ol className="mt-2 list-decimal ps-5 text-sm text-slate-700">
          <li className="mb-1.5">{t("clearingHouse.instructions.step1")}</li>
          <li className="mb-1.5">{t("clearingHouse.instructions.step2")}</li>
          <li>{t("clearingHouse.instructions.step3")}</li>
        </ol>
        <p className="mt-2 text-xs text-slate-500">{t("clearingHouse.instructions.otherFiles")}</p>
        <a
          href={SITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-sm font-medium text-teal-700 underline hover:text-teal-800"
        >
          {t("clearingHouse.instructions.openSite")}
        </a>
      </section>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center ${
          dragging ? "border-teal-500 bg-teal-50" : "border-slate-300 bg-white"
        }`}
      >
        <label
          className={`cursor-pointer rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-white focus-within:ring-2 focus-within:ring-teal-400 focus-within:ring-offset-2 ${
            busy ? "pointer-events-none opacity-60" : "hover:bg-teal-700"
          }`}
        >
          {t("clearingHouse.pick.choose")}
          <input
            type="file"
            multiple
            accept=".zip,.xml,application/zip,application/xml,text/xml"
            disabled={busy}
            onChange={handleChange}
            className="sr-only"
          />
        </label>
        <p className="text-xs text-slate-500">{t("clearingHouse.pick.drop")}</p>
      </div>

      {busy && (
        <p role="status" className="text-sm text-slate-600">
          {t("clearingHouse.reading")}
        </p>
      )}
      {errorMessage && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      )}

      <p className="text-xs text-slate-500">{t("clearingHouse.privacy")}</p>
    </div>
  );
}
