# Cover plan for early retirement — design

Status: **proposal 2026-11-06; the six open questions were answered the same
day (section 10) and the build started (section 9 tracks what is built).**
Every number in this file is an invented example. The legal rules behind
it are rule V in `constants-to-verify.md` (secondary sources, Medium or Low
confidence, none read on gov.il).

## 1. The problem

A pension fund, a managers insurance and some provident funds bundle **risk
cover** with the savings: a survivors' pension (and a death sum) if the member
dies, and a disability pension. The cover exists only while the member is
*active*, that is, while deposits are being paid. A person who retires at, say,
52 stops the deposits and the cover starts to lapse long before the pension
can be drawn (60 in the app).

The app today stores the cover facts but does nothing with them (section 2).
So it cannot answer: "I retire at 52. For the years between the end of the
free continuation and age 60, what do I do about survivors' cover, and what
does each choice cost?"

Survivors' cover is the one most likely to be worth keeping. Disability cover
pays out of lost earnings, so it has little value once the person has stopped
working on purpose; **the owner left disability out entirely** (Q5).

## 2. What the app does today

- `PensionAccount.insuranceCoverages` holds `deathCoverageAmount`,
  `monthlyDisabilityAmount`, `monthlyRiskDeduction` and the survivors' pension
  fields. They are typed in `PensionAccountForm.tsx` or imported from the
  Clearing House report (`mapReport.ts`).
- **Before this work the engine never read them.** `monthlyContributionForAccount`
  (`contributions.ts`) was salary × (employee + employer + severance rates)
  while the person is working. The risk premium was not subtracted from the
  deposit, so the accumulated balance was **overstated** for anyone who has a
  deduction on file. Step C6 fixed this (see section 9).
- The import drops survivor percentages, release from premiums, critical
  illness and combined-savings cover types (`clearing-house-import-analysis.md`
  sections 6.5 and 12.3).
- Nothing tells the user that cover ends, and when.

## 3. What this covers of the declined survivor analysis, and what it does not

The owner declined **survivor analysis** in Phase L (`SESSION-HANDOFF.md`,
"Phase L (tax refinements)"). That meant: simulating the death of either
spouse, survivor pensions, and the household's income afterwards.

This design is **narrower**: a cost, timeline and gap-size feature, not a death
simulation. **On 2026-11-06 the owner widened it on one point (Q1):** the app
also computes the *size* of the gap in money from the survivors' pension that
the Clearing House report states. That reverses the earlier "survivor
percentages are ignored" decision (`clearing-house-import-analysis.md`
section 6.5) for the spouse's survivors' pension only. Simulating the death
itself stays declined.

| Part of survivor / risk-cover analysis | In this design? |
|---|---|
| Know whether cover will have lapsed by a given age (the protection gap window) | **Yes** |
| Cost of keeping cover or buying a replacement, shown in the plan | **Yes** |
| Show the cover facts the user already stored (death sum, risk deduction) next to the choice | **Yes** (read-only) |
| Import the spouse's survivors' pension (amount and percent) from the report | **Yes** (Q1) |
| How big the gap is in money: insured survivors' pension minus a balance-only estimate | **Yes** (Q1), flagged as an estimate (section 5) |
| Orphans' and dependent parents' pensions | **No**: only the spouse's survivors' pension |
| Model the household after one spouse dies (income, tax, spending) | **No** |
| Recommend an option | **No** |
| Disability cover | **No** (Q5) |

## 4. Findings that shape the design

All from rule V; confidence is Medium or Low and the specifics must be
checked against the member's own fund bylaws and policy.

- **Free extension:** about 5 full months from the last deposit, in a
  comprehensive pension fund (managers insurance: about 3, policy-specific).
- **Insurance arrangement (הסדר ביטוח):** the member asks within the first 5
  months; cover continues for at most 24 months from the last deposit, no
  longer than the last consecutive deposit period, paid by deduction from the
  balance or by direct debit.
- **Ends early** if the member withdraws contributions, transfers the fund, or
  the contributions balance runs out. The arrangement is barred after a
  withdrawal or transfer.
- **After that: uninsured.** No disability cover; the survivors' benefit may
  fall to the balance only. Coming back means a new qualifying period (one
  insurer says 60 consecutive insured months) and possibly new health
  underwriting.
- **Unverified:** whether someone who no longer earns may keep depositing at
  full cover, whether such deposits get any tax benefit (probably not), how the
  cost rises with age, and how large an uninsured member's survivors' benefit
  is.

## 5. Concepts

**Continuation window.** The statutory period after the last deposit in which
cover is kept at low or no cost: up to 24 months with the arrangement (about 5
months without). Named this way so it is not confused with the Bridge
Planner's "bridge", the years until the pension opens.

**Need window.** From the end of the continuation window to the **need-until
age**: the earliest age the pension can be drawn (60 in the app; survivors'
provisions then sit in the annuity form the user picks), or a later age the
user chooses (dependents independent, assets enough to self-insure).

**Coverage window.** Per option, the ages at which cover exists. "Insurance
termination age" belongs here, to the option (for example the end age of a
term policy), not to the gap.

**Protection gap.** The ages at which cover is needed but absent. It starts
when the option's cover ends (never before the free extension ends) and ends
at the need-until age. It is shown in years and, where the report gives the
data, in money (below). It is zero if the person retires at or after the
need-until age, and zero when an option's coverage reaches the need-until age.

**Three options** the user can choose between:

| Option | Coverage window | Cost shown |
|---|---|---|
| 1. None, self-insure | the free extension only (about 5 months after the last deposit) | ₪0 |
| 2. Keep existing pension insurance | 2a: the arrangement, up to 24 months after the last deposit. 2b: personal deposits beyond it. The owner chose to **assume** a non-earner may keep paying (Q2); a toggle in My Data switches this off | The user's monthly cost, default = the sum of the person's accounts' `monthlyRiskDeduction`, paid out of pocket from the end of the free extension |
| 3. Independent term life | from the end of the free extension to the policy's term end age | The user's quote per month (the premium rises with age and needs underwriting; probably no tax relief without income) |

The app never says which is better. It shows the gap, the cost and the facts.

**Cover you would lose.** A read-only list, per person, of the stored
`deathCoverageAmount` and the survivors' pension of the accounts that stop
being active at retirement. It uses only data the user or the import already
entered. Disability is not shown (Q5).

**Gap in money (Q1).** Two figures per person, each a monthly amount in
today's money:

- *Insured survivors' pension*: the sum of `monthlySurvivorsSpousePension`
  over the person's accounts (imported from the Clearing House report or
  typed in).
- *Balance-only estimate* (Low confidence): the same accounts' projected
  balance at the start of the gap divided by each account's own
  `conversionFactor`. It is not computed for an account without a factor.

The gap in money is the first minus the second, never below zero. It
describes what the spouse would be missing if the person died at the start of
the gap, for the spouse's survivors' pension only. Orphans' and parents'
pensions and any lump sum are not netted. Whether an uninsured member's
survivors' benefit equals the balance-only figure is unverified (rule V).

## 6. Data model

One new optional record per insured person, **not** stored on the account:
`insuranceCoverages` holds facts about a product; this is a decision about the
person. It sits next to the other per-person fields, so the existing person
tabs and spouse handling cover it.

```ts
export type CoverOption = "none" | "keepPensionInsurance" | "termLife";

export interface CoverPlan {
  option: CoverOption;
  /** Age until which the cover is needed; null = the earliest pension age (60). */
  needUntilAge: number | null;
  /** The user's own monthly cost for the chosen option; null = the sum of the accounts' monthlyRiskDeduction (option 2) or unknown. */
  monthlyCost: number | null;
  /** Option 3: the age at which the term policy ends; null = the need-until age. */
  termEndAge: number | null;
  /** Option 2: assume personal deposits can go on after the 24-month arrangement (Q2). */
  keepPayingAfterArrangement: boolean;
}
```

- `PersonalData.coverPlan: CoverPlan | null` and `SpouseData.coverPlan:
  CoverPlan | null`. **null means "not decided": no card shows a cost, no
  number changes.** A saved profile without the field is read as null.
- `keepPayingAfterArrangement` starts **on** when option 2 is picked (the
  owner's answer to Q2 is "assume yes, with a toggle"); the user can switch it
  off. Only option 2 reads it.
- `InsuranceCoverages` gains `monthlySurvivorsSpousePension` (the monthly
  survivors' pension to the spouse that the product insures, today's money)
  and `survivorSpousePercent` (the same as a share of the pensionable salary,
  as the report states it), both `number | null`.
- Persistence work: `EMPTY_PROFILE` and `EMPTY_SPOUSE` in `types/index.ts`, the
  profile normalisation in `profileIO.ts`, `spouseProfileView` in
  `household.ts`, and `domainFixtures.ts`.
- **Each partner has their own plan (Q6).** A cover plan protects the *other*
  person: the spouse's plan describes the cover that protects the primary user
  and the other way round. The labels name who is insured and who is
  protected.

## 7. Where it lives in the UI

| Where | What | Pattern copied from |
|---|---|---|
| My Data → Personal (and the spouse section): new optional CollapsibleSection "Cover after I stop working" | Pick the option, need-until age, monthly cost, term end age and the "keep paying after the arrangement" toggle; shows "cover you would lose", the derived windows and the gap | Tax-exemption and Bituach Leumi sections in `PersonalStep.tsx`, `SpouseSection.tsx` |
| My Data → Pension account form | Two new fields for the spouse's survivors' pension (amount and percent), filled by the import | The existing coverage fields in `PensionAccountForm.tsx` |
| My Data → Expenses: a **read-only** block "Insurance cover costs" (both modes) | Per person: option, monthly cost, age range, "on top of the desired spending, not editable here" | `ExpensesStep.tsx` |
| Projections: new card "Cover after I stop working" | The three options side by side: gap in years and in money, cost per month, total cost until the need-until age, and the effect on the plan (first shortfall year, net worth at the horizon) | `WithdrawalStrategyCard` (runs the plan once per variant) |
| Dashboard: `CoverNoticeCard` (`components/CoverNoticeCard.tsx`) | "Your pension insurance ends at about age X, Y years before the pension opens: choose an option" (shown only when the person has cover on file, no plan is saved and a gap exists) | The bridge warning, `DataGapsCard` |

The choice is stored in the profile (`coverPlan`), not in `assumptions`: it
differs per person, and `assumptions` holds household-wide modeling knobs.

## 8. Engine hook

The retirement engine is a **level-spending model**: `retirementIncome.ts`
solves the largest level monthly amount the household can spend, `drawdown.ts`
runs the balances with that amount, and `netIncome.ts` taxes it. Expenses have
no age range (a known deferred item), so a cost that lasts only a few years
cannot be put into the expense items. The cover cost is therefore a separate
**outflow in today's money, paid out of pocket (Q3)**, carried on each
`HouseholdMember` as `coverCost` (`{ option, monthly, startAge, endAge }`, from
`domain/coverCost.ts`), one per insured person who chose to pay for cover:

- **Income solver:** each entry is a negative stream (an amount that must be
  funded through its months). The sustainable level spending is what is left
  for everything else.
- **Drawdown:** each year's needed draw is the spending plus the cover cost of
  that year, less the fixed streams. Net worth and the first shortfall year
  therefore include it.
- **Net income:** the cover cost drawn in a year is added to the gross amount
  drawn (so it bears tax like any other draw) and subtracted again from the
  net amount; the year's net income is what is left to live on.
- **Risk premium in deposits (C6):** while the person works, the
  `monthlyRiskDeduction` is part of the deposit but buys cover, not savings, so
  it is subtracted from the amount added to the balance. After retirement,
  option 2 charges the same figure out of pocket (Q2, Q3).
- Windows (`freeEndAge`, `coverEndAge`, `needEndAge`, `gapYears`, the gap in
  money) are computed in a new `domain/coverPlan.ts` as pure functions, so the
  Dashboard, the card, the Expenses block and the engine share them. The
  constants (24 and 5 months) go into `accessRules.ts` with a pointer to
  rule V.
- Every calculated value is written to the calculation trace (Phase P) and to
  the verification pack's self-check, per `bridge-planner-design.md` section 5.
  Test vectors use invented numbers only.
- A plan with `option: "none"`, or a null plan, adds no outflow, so those
  profiles keep their current numbers. The one exception is C6, which lowers
  deposits for any profile with a stored risk deduction, plan or not.

## 9. Build order and status (each step ships on its own)

| Step | What | Changes numbers? | Status |
|---|---|---|---|
| C1 | This design and rule V | No | Done |
| C2 | Types, `EMPTY_PROFILE`, normalisation, My Data section (inputs only) | No | Done (2026-11-06) |
| C2b | Survivors' pension fields: types, import, manual entry | No | Done (2026-11-06) |
| C3 | `domain/coverPlan.ts` windows, gap and gap in money, `domain/coverAnalysis.ts` assembly (pure, tested), result block in the My Data section, Dashboard "cover ends" card | No | Done (2026-11-06) |
| C4 | Projections card with the three options, cost and gap, without an engine change | No | Done (2026-11-06) |
| C5 | Cover-cost outflow in the solver, `drawdown.ts` and `netIncome.ts`, the trace, the verification pack and the read-only Expenses block | Yes, only for people who saved a plan with a cost | Done (2026-11-06) |
| C6 | Subtract `monthlyRiskDeduction` from deposits in `contributions.ts` (floored at 0), the `monthlyDeposit` trace step, a helper under the field in the account form | Yes, for everyone with a stored deduction. This fixes the existing overstatement; it is its own step so its effect is visible | Done (2026-11-06) |

C2 to C4 need nothing from the engine and change no number. C6 is independent
of the others. After C6 a profile with a stored deduction shows a lower balance
at retirement by the premium's future value (`contributions.test.ts`,
"risk premium in the sources").

## 10. Questions and the owner's answers (2026-11-06)

1. **Gap in money?** **Yes, compute it from imported survivor percentages**
   (expands scope). Recorded in sections 3 and 5. The Clearing House fields
   are `KITZBAT-SHEERIM-LEALMAN-O-ALMANA` (amount) and
   `SHEUR-KISUY-ALMAN-O-ALMANA` (percent). Their parent node in the XML is
   **not verified** (no sample file is in the repo), so the mapper reads them
   by element name, never by position (`clearing-house-import-analysis.md`
   section 12.3).
2. **Personal deposits for a non-earner.** **Assume yes (option "B"), at the
   same cost as the risk deduction, with a toggle in My Data** to switch the
   assumption off. The toggle is `keepPayingAfterArrangement`; the owner did
   not state its default, so it is **on** when option 2 is picked. Whether the
   fund really accepts such deposits stays unverified (rule V).
3. **Who pays?** **Out of pocket (option A)**: an outflow from the household,
   not a deduction from the balance. It is **shown in the expenses report, not
   editable there** (section 7).
4. **Need-until age.** **The pension start (60 in the app) by default,
   editable per plan.** The gap starts when the option's cover ends (never
   before the free extension ends, about 5 months after the last deposit) and
   ends at the need-until age.
5. **Disability.** **Left out entirely.** No field, no cost, no display.
6. **Who is protected.** **Both partners, each with their own plan.**

## 11. Directions not worth building

- A simulation of the household after a death (declined survivor analysis).
- A premium quote engine or an age-cost table for term life: the user types
  the quote, and any table would be invented.
- Health underwriting or an "is this cover worth it" score.
- Recommending an option; the app shows facts and costs side by side.
- Disability benefit modeling (the owner's answer to Q5).
- Orphans' and dependent parents' pensions, and netting a death lump sum
  against the gap.
- Choosing the cheapest option automatically.
