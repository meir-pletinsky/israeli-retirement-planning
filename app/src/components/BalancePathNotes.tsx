import { useTranslation } from "react-i18next";

import type {
  BalancePath,
  PathEvent,
  PathEventGroup,
  SourceKind,
  SpendingFunding,
  UnvestedShares,
} from "../domain";

const isolate = (text: string) => `\u2066${text}\u2069`;

const KIND_LABELS: Record<SourceKind, string> = {
  pensionFund: "projections.sourcePension",
  providentFund: "projections.sourceProvidentFund",
  managersInsurance: "projections.sourceManagersInsurance",
  studyFund: "projections.sourceStudyFund",
  otherInvestments: "projections.sourceInvestments",
};

/** The name of a kind of savings, as the by-source charts and the table headings spell it. */
function useKindLabel() {
  const { t } = useTranslation();
  return (kind: SourceKind) => t(KIND_LABELS[kind]);
}

/** Why the line starts above the total of what is vested today; null when no unvested shares are counted. */
function useUnvestedSharesText(unvestedShares: UnvestedShares | null | undefined): string | null {
  const { t } = useTranslation();
  if (!unvestedShares) return null;
  const params = {
    amount: isolate(`${t("common.currencySymbol")}${unvestedShares.value.toLocaleString()}`),
    from: isolate(String(unvestedShares.firstVestAge)),
    to: isolate(String(unvestedShares.lastVestAge)),
  };
  return unvestedShares.firstVestAge === unvestedShares.lastVestAge
    ? t("projections.path.unvestedOne", params)
    : t("projections.path.unvestedRange", params);
}

function PathEventText({ event, drawing }: { event: PathEvent; drawing: boolean }) {
  const { t } = useTranslation();
  const kindLabel = useKindLabel();
  const currencySymbol = t("common.currencySymbol");
  const money = (amount: number) => isolate(`${currencySymbol}${amount.toLocaleString()}`);
  const age = isolate(String(event.age));

  if (event.type === "retirement") {
    const key = event.household
      ? drawing
        ? "projections.path.retireHousehold"
        : "projections.path.retireHouseholdNoSpending"
      : drawing
        ? "projections.path.retire"
        : "projections.path.retireNoSpending";
    return <>{t(key, { age })}</>;
  }
  return (
    <>
      {t("projections.path.annuity", {
        age,
        kind: isolate(kindLabel(event.kind)),
        capital: money(event.capital),
        monthly: money(event.monthly),
      })}
    </>
  );
}

interface PathEventsListProps {
  groups: readonly PathEventGroup[];
  /** What the planned spending does to the savings; without it the list says nothing about spending. */
  funding?: SpendingFunding;
  /** Employer shares that have not vested yet but are counted from the start of the line. */
  unvestedShares?: UnvestedShares | null;
}

/**
 * The events behind the steps of the balance chart, numbered like the lines on it: when drawing
 * on savings starts (or that nothing is drawn, when no spending is entered), and when a kind of
 * savings stops being a balance because it became an annuity (the chart shows the balance you
 * could spend, and an annuity is paid as monthly income). Unnumbered notes follow: the employer
 * shares that are counted from the start although they vest later (the reason the line starts
 * above the total of what is vested today), and the age at which the planned spending goes
 * unfunded, which the chart marks with its own line.
 */
export function PathEventsList({ groups, funding, unvestedShares }: PathEventsListProps) {
  const { t } = useTranslation();
  const unvestedText = useUnvestedSharesText(unvestedShares);
  if (groups.length === 0) return null;
  const drawing = funding === undefined || funding.monthlySpending > 0;

  return (
    <section aria-labelledby="path-events-title" className="mt-3">
      <h3 id="path-events-title" className="text-xs font-semibold text-slate-700">
        {t("projections.path.title")}
      </h3>
      <ol className="mt-1.5 space-y-1.5">
        {groups.map((group, index) => (
          <li key={group.age} className="flex items-start gap-2 text-xs text-slate-600">
            <span
              aria-hidden="true"
              className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[10px] font-semibold text-brand-700"
            >
              {index + 1}
            </span>
            <span className="space-y-1">
              {group.events.map((event, eventIndex) => (
                <span key={eventIndex} className="block">
                  <PathEventText event={event} drawing={drawing} />
                </span>
              ))}
            </span>
          </li>
        ))}
      </ol>
      {unvestedText && (
        <p className="mt-1.5 flex items-start gap-2 text-xs text-slate-600">
          <span
            aria-hidden="true"
            className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600"
          >
            i
          </span>
          <span>{unvestedText}</span>
        </p>
      )}
      {funding?.shortfallAge != null && (
        <p className="mt-1.5 flex items-start gap-2 text-xs font-medium text-rose-700">
          <span
            aria-hidden="true"
            className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-rose-50 text-[10px] font-semibold"
          >
            !
          </span>
          <span>{t("projections.path.shortfall", { age: isolate(String(funding.shortfallAge)) })}</span>
        </p>
      )}
    </section>
  );
}

interface BalanceTableProps {
  path: BalancePath;
}

/**
 * The balance at the end of each year by kind of savings, with what the figures include and what
 * the model cannot split: bank deposits, shares and other holdings share one investments pool, so
 * there is no separate path for each.
 */
export function BalanceTable({ path }: BalanceTableProps) {
  const { t } = useTranslation();
  const kindLabel = useKindLabel();
  const currencySymbol = t("common.currencySymbol");
  const money = (amount: number) => `${currencySymbol}${amount.toLocaleString()}`;
  const unvestedText = useUnvestedSharesText(path.unvestedShares);

  return (
    <div>
      <div className="mb-2 space-y-1 text-xs text-slate-500">
        <p>{t("projections.path.tableNote")}</p>
        {path.kinds.includes("otherInvestments") && (
          <p>{t("projections.path.poolNote", { pool: isolate(kindLabel("otherInvestments")) })}</p>
        )}
        {unvestedText && <p>{unvestedText}</p>}
      </div>
      <div className="max-h-72 overflow-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr>
              <th className="sticky start-0 top-0 z-10 bg-white py-1 pe-3 text-start text-slate-500">
                {t("myData.steps.personal.age")}
              </th>
              {path.kinds.map((kind) => (
                <th key={kind} className="sticky top-0 bg-white py-1 pe-3 text-start font-medium text-slate-500">
                  {kindLabel(kind)}
                </th>
              ))}
              <th className="sticky top-0 bg-white py-1 text-start font-semibold text-slate-700">
                {t("projections.path.total")}
              </th>
            </tr>
          </thead>
          <tbody>
            {path.points.map((point) => (
              <tr key={point.age} className="border-t border-slate-100">
                <td className="sticky start-0 bg-white py-1 pe-3">{point.age}</td>
                {path.kinds.map((kind) => (
                  <td key={kind} className="py-1 pe-3">
                    {money(point.byKind[kind])}
                  </td>
                ))}
                <td className="py-1 font-semibold">{money(point.netWorth)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
