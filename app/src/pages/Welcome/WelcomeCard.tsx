import type { ReactNode } from "react";

interface WelcomeCardProps {
  titleId: string;
  title: string;
  icon: ReactNode;
  tone?: "plain" | "brand";
  children: ReactNode;
}

/** A titled box on the welcome page. The `brand` tone is the tinted one used for the privacy promise. */
export function WelcomeCard({ titleId, title, icon, tone = "plain", children }: WelcomeCardProps) {
  const toneClasses =
    tone === "brand"
      ? "border-brand-100 bg-brand-50 text-brand-900"
      : "border-slate-200 bg-white text-slate-700";
  return (
    <section
      aria-labelledby={titleId}
      className={`flex flex-col gap-3 rounded-xl border p-5 text-sm leading-relaxed shadow-sm ${toneClasses}`}
    >
      <h2 id={titleId} className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <span aria-hidden="true" className="text-brand-600">
          {icon}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

const ICON_PROPS = {
  viewBox: "0 0 24 24",
  width: 20,
  height: 20,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  className: "shrink-0",
} as const;

export function InfoIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function BoltIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="m5 12 5 5 9-10" />
    </svg>
  );
}
