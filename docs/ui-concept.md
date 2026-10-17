# UI Concept (Phase 1 / MVP)

Companion to `docs/plan.md`. Describes the information architecture,
screens, components, and visual direction for the MVP. A click-through
prototype implementing this (no calculation logic) lives in `prototype/`.

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
  summary sentence, not just a number.
- Empty state (no data yet): prompts user into the My Data wizard.
- CTA to adjust assumptions (jumps to My Data → Assumptions tab).

### 3. My Data (wizard, tabbed once completed once)

Steps, each its own screen on mobile / tab on desktop:

1. **Personal** — age (or DOB), gender, desired retirement age.
2. **Pension & Savings** — current Keren Pensia balance, Keren Hishtalmut
   balance, other investment assets (single lump-sum field for MVP).
3. **Expenses** — current monthly living expenses, expected retirement
   monthly expenses (default = same as current, editable).
4. **Assumptions** — investment return & inflation: three preset chips
   (Conservative/Base/Optimistic) plus an "advanced" expand to override the
   raw percentages.

Each step: clear field labels + helper text (units, e.g. "monthly, in ₪"),
inline validation, Next/Back, progress indicator. Completing all steps
routes to Dashboard; after first completion, My Data becomes editable via
tabs instead of a forced wizard.

### 4. Projections

- Scenario selector: Standard / Early / Delayed retirement age (slider or
  segmented control), updates charts live.
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
- `CurrencyInput`, `PercentInput`, `AgeInput`, `SelectField`
- `ProjectionLineChart`, `IncomeStackedBarChart`
- `ConfirmModal` (used for destructive actions)
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

## Prototype Scope (`prototype/`)

A React + TypeScript + Vite + Tailwind app implementing the screens above
with static/mock data and working navigation, language switching (with RTL
flip), and responsive layout — **no real calculation logic**. Purpose: get
sign-off on structure, navigation, and visual direction before the domain
engine and persistence layer are built in Phase 1 implementation.
