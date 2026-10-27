# UI Concept (Phase 1 / MVP)

Companion to `docs/plan.md`. Describes the information architecture,
screens, components, and visual direction for the MVP. A click-through
prototype implementing this (no calculation logic) was built first, then
evolved in place into the real application — see `app/` and
`docs/implementation-progress.md`.

## Design Principles

- **Professional & clean**: generous whitespace, restrained color palette,
  clear hierarchy — this handles people's retirement finances, it should
  feel trustworthy, not flashy.
- **Data-dense but legible**: dashboards show several numbers/charts at
  once; group with cards and consistent spacing rather than clutter.
- **Progressive disclosure**: Phase 1 input is a short guided wizard, not a
  giant form; advanced/assumption fields are collapsible.
- **Localization-safe layout**: no fixed-width text containers that break
  with longer Russian/Hebrew strings; RTL mirrors the entire layout, not
  just text direction.

## Visual Direction

- **Palette**: neutral base (slate/gray) + one primary accent (blue/teal)
  for actions and key figures; a second accent (green/amber/red) reserved
  for status only (on-track / at-risk / shortfall).
- **Typography**: system font stack with Hebrew + Cyrillic fallback
  coverage (e.g., Inter/system-ui + Noto Sans Hebrew). Clear type scale:
  large KPI numbers, medium section headers, regular body text.
- **Components**: rounded-corner cards, soft shadows, flat icons (no
  skeuomorphism). Consistent 8px spacing scale (Tailwind default).
- **Charts**: Recharts line chart (net worth over time) and stacked bar
  (income by source); consistent color mapping per source across screens.

## Navigation Structure

- **Desktop/tablet**: persistent left sidebar with sections below; content
  area to the right; top bar has language switcher only.
- **Mobile**: bottom tab bar with the same 4 primary sections; no sidebar.
- In RTL (Hebrew), the sidebar moves to the right edge; icons/arrows mirror.

Primary sections:

1. **Dashboard** (home)
2. **My Data** (profile & inputs wizard)
3. **Projections** (detailed charts/scenarios)
4. **Settings**

## Screens

### 1. Welcome / First Run

- Shown only when no profile data exists yet.
- Short value proposition, language selector (en/ru/he), privacy note
  ("your data stays on this device"), single CTA: "Start my plan".
- Secondary action: "Import data" (restore from a previously exported
  JSON file) for returning users on a new device.

### 2. Dashboard

- KPI cards row: Projected Monthly Retirement Income, Net Worth Today,
  Funding Gap, Years to Retirement.
- Net worth projection chart (line, today → life expectancy), with a
  vertical marker at target retirement age.
- "Retirement readiness" status banner (on-track / shortfall), plain-language
  summary sentence, not just a number. Hidden, and the Funding Gap KPI shows
  "—", until the user has entered a desired retirement spending.
- "Improve your estimate" card: the optional details that would change the
  result (desired spending, savings, a spouse's age, account type / status /
  contribution rates, salary, gender), each linking to the My Data step that
  fixes it. Shown only while there is something to improve.
- Empty state (no data yet): prompts user into the My Data wizard.
- CTA to adjust assumptions (jumps to My Data → Assumptions tab).

### 3. My Data (wizard, tabbed once completed once)

Steps, each its own screen on mobile / tab on desktop:

1. **Personal** — age (or DOB), gender, marital status, desired retirement
   age, tax credit points (Nekudot Zikui), and a collapsible "Tax exemption
   basket (Kibua Zchuyot)" section (Form 161D submitted, past tax-free
   severance withdrawn, remaining monthly exemption cap) for users who have
   gone through rights-fixation.
2. **Pension & Savings** — a **repeater** of pension/savings accounts (add,
   edit, remove via a modal form) rather than flat balance fields, so users
   with several Keren Pensia / Kupat Gemel / Bituach Menahalim / Keren
   Hishtalmut accounts can model each separately. Each account captures
   provider, product category, account status, legacy policy model, dates,
   and total balance up front, with four collapsible "advanced" sections:
   Balance breakdown (pre/post-2008, Tikun 190, severance), Annuity
   parameters (guaranteed conversion factor, estimated monthly annuity, tax
   type, guaranteed payment period), Insurance coverages (death/disability/
   risk premium), and Investment track & fees. A separate "Other assets"
   field remains for cash/bonds/real-estate catch-all amounts.
3. **Equity & Investments** — a repeater of stock/equity holdings (add,
   edit, remove via modal), covering the three realistic Israeli equity-
   compensation patterns: employer-granted RSUs/options (Section 102
   trustee track or Section 3(i), vesting, cost basis), ESPP purchases
   (discount %, purchase vs. fair-market value, taxable discount vs.
   capital gain), and personal brokerage holdings (average cost basis,
   unrealized gain, capital-gains tax rate). The category selector drives
   which detail section is shown; total value is always derived from
   quantity × current price, never stored redundantly.
4. **Expenses** — current monthly living expenses, expected retirement
   monthly expenses (default = same as current, editable).
5. **Assumptions** — investment return & inflation: three preset chips
   (Conservative/Base/Optimistic) plus an "advanced" expand to override the
   raw percentages.

Each step: clear field labels + helper text (units, e.g. "monthly, in ₪"),
inline validation, Next/Back, progress indicator. Completing all steps
routes to Dashboard; after first completion, My Data becomes editable via
tabs instead of a forced wizard.

**Which fields matter.** Only the current age and the desired retirement
age (and a spouse's retirement age once a spouse age is entered) block the
plan. Every other label carries a badge, and a "Which fields matter?" legend
heads each step:

- **Required** — the plan cannot be computed without it.
- **Recommended** — optional, but the result changes noticeably (salary,
  gender, account type / status / balance / contribution rates, desired
  retirement spending, equity quantity and price).
- **Reference only** — saved and exported, but used by no calculation:
  provider, policy number, fund ID ("mispar kupa"), fees, insurance
  coverages, balance breakdown, Form 161D, and similar cross-reference
  details.
- No badge — an optional refinement with a sensible default.

A person without a partner needs only the two ages; the spouse section is
a single optional block and nothing else on any screen assumes a partner.

The repeater steps (Pension & Savings, Equity & Investments) share one
UX pattern: a card list with "Add" button, each card showing a compact
summary (name + key figure) with Edit/Remove actions, Edit/Add opening a
large scrollable `FormModal`, and Remove requiring `ConfirmModal`
confirmation. This keeps the main wizard screen short even though the
underlying data model (matching the Israeli pension/equity JSON schema
used to design it) supports dozens of optional, category-specific fields
per entry.

### 4. Projections

- Scenario selector: Standard / Early / Delayed retirement age (segmented
  control), updates the charts live.
- Earliest feasible retirement age card (or a link to add expenses when
  there is no desired spending yet).
- Retirement age comparison card: three freely chosen retirement ages side
  by side (years from now, savings, income before and after tax, gap to the
  desired spending), with the user's own age marked, a chart of the three
  against the desired spending, and the chosen ages saved in the profile.
- Net worth projection (line) and income-by-source breakdown (stacked bar,
  even though Phase 1 has few sources — sets up Phase 2 growth).
- Table view toggle for users who prefer numbers over charts.

### 5. Settings

- Language (English/Russian/עברית) — immediate switch, persists.
- Currency display preference (₪ primary; later phases may add FX display).
- Data management: Export data (download JSON), Import data, Reset all
  data (confirmation modal, destructive-action styling).
- About / data sources & assumptions disclosure.

## Core Components (shared)

- `AppShell` — sidebar/bottom-nav + header + content slot, direction-aware.
- `LanguageSwitcher`
- `KpiCard` — label, value, trend/status indicator
- `StatusBanner` — on-track/at-risk/shortfall messaging
- `Stepper` / `WizardLayout`
- `CurrencyInput`/`NumberField`, `PercentInput`, `AgeInput`, `SelectField`,
  `TextField`, `DateField`, `CheckboxField`
- `CollapsibleSection` — expand/collapse wrapper for advanced/optional
  field groups (used heavily in the Pension/Equity account forms)
- `FieldLabel` / `FieldLegend` — the Required / Recommended / Reference
  only badge on every field label and section title, and the legend that
  explains them
- `DataGapsCard` — the Dashboard's "Improve your estimate" card
- `FormModal` — large scrollable modal shell (header, body, footer) used
  to add/edit a single repeater entry (pension account, equity holding)
- `ProjectionLineChart`, `IncomeStackedBarChart`
- `ConfirmModal` (used for destructive actions, including repeater-entry
  removal)
- `EmptyState`

## Responsive Behavior

- Breakpoints: mobile (<640px), tablet (640–1024px), desktop (>1024px).
- KPI cards: 1 column mobile → 2 tablet → 4 desktop.
- Wizard: full-screen single-step mobile → multi-tab single page desktop.
- Charts: stack vertically and simplify legends on mobile.

## Accessibility

- Color is never the only status signal (icon/text accompanies status
  color).
- All interactive elements keyboard-reachable; forms have associated
  labels (required for screen readers in all three languages).
- Contrast meets WCAG AA for text and key UI elements.

## Prototype Scope (historical — superseded by `app/`)

A React + TypeScript + Vite + Tailwind app implementing the screens above
with static/mock data and working navigation, language switching (with RTL
flip), and responsive layout — **no real calculation logic**. Purpose: get
sign-off on structure, navigation, and visual direction before the domain
engine and persistence layer are built in Phase 1 implementation. That
prototype folder was later renamed `app/` and is being extended in place
with real persistence and calculations; see `docs/implementation-progress.md`
for current status.
