# Constants and rules to verify against official sources

The app hard-codes Israeli tax, National Insurance (Bituach Leumi) and
savings-access figures. Most were checked against **secondary sources only**
because gov.il and taxes.gov.il refuse automated requests. This file lists
every such number, where it lives in the code, how confident we are, and what
to search for, so you can confirm it yourself in a browser.

**How to use it**

1. Work down the tax table (section 1) first; those are the least certain.
2. For each row, open the official page, find the figure, and fill in the
   "Your check" column (the value you found and the date).
3. If a value differs, change it in the file named in "Where" and update the
   tests that hard-code the old result (`tax.test.ts`, `netIncome.test.ts`,
   `fundingGap.test.ts`, `Dashboard.test.tsx`). Then run `npm test`,
   `npm run typecheck` and `npm run lint` from `app/`.
4. Update `effectiveDate` next to the constant; the Dashboard shows it to
   users as "Tax rates as of ...".

Confidence: **High** = long-standing figure that several sources agree on;
**Medium** = sources agreed but none was official, or the figure changes
yearly; **Low** = formula or interpretation we could not confirm.

## Where to look (official sources)

- Israel Tax Authority: https://www.gov.il/he/departments/israel_tax_authority
  (also taxes.gov.il). Look for the annual "Tax Authority circular /
  updated tax tables" (חוזר רשות המסים, "תיאומי מס", "טבלאות מס").
- Kol-Zchut (rights site): https://www.kolzchut.org.il. Search the Hebrew
  terms below; it cites the law and the Tax Authority pages.
- Capital Market, Insurance and Savings Authority (for savings products):
  https://www.gov.il/he/departments/capital_market_insurance_and_savings
- Bituach Leumi: https://www.btl.gov.il (already checked directly, see
  section 2).
- Tax legislation and amendments: the Knesset site, and the Income Tax
  Ordinance sections named below.

## 1. Income-tax constants (`app/src/domain/taxRates.ts`, as of 2026-01-01)

| # | Constant (field) | Value used | Confidence | What to look up (Hebrew search terms) | Your check |
|---|---|---|---|---|---|
| 1 | Bracket 1 upper limit (`monthlyBrackets[0]`) | 10% up to ₪7,010 / month | Medium-High | מדרגות מס הכנסה 2026 | 2026-10-27, assistant: PwC annual 2026 table gives ₪84,120 a year = 7,010 × 12. Matches. Gov.il not read |
| 2 | Bracket 2 | 14% up to ₪10,060 | Medium-High | same | PwC ₪120,720 a year = 10,060 × 12. Matches |
| 3 | Bracket 3 | 20% up to ₪19,000 | Medium-High | same | PwC ₪228,000 a year = 19,000 × 12. Matches. (One SEO blog, naama-tax.co.il, shows 16,150, which is the 2025 value) |
| 4 | Bracket 4 | 31% up to ₪25,100 | Medium-High | same | PwC ₪301,200 a year = 25,100 × 12. Matches. (The same blog shows 22,440, the 2025 value) |
| 5 | Bracket 5 | 35% up to **₪46,690** | Medium-High | same; older material says ₪53,970 (a 2022-23 value). We use 46,690 because of the legislated widening for 2026 | PwC ₪560,280 a year = 46,690 × 12. Matches, and finav.co.il (which cites the Tax Authority table NAV26) agrees |
| 6 | Top rate | 47% above bracket 5 | High | same | PwC: 47% from ₪560,280 to ₪721,560, then 50% with the surtax. Matches |
| 7 | Credit point value (`creditPointMonthlyValue`) | ₪242 / month | Medium | ערך נקודת זיכוי 2026. The 2025 value was reported inconsistently (₪235 vs ₪242) | finav.co.il lists ₪242 a month (₪2,904 a year). PwC's page does not state it. Not checked on gov.il |
| 8 | Default credit points, man (`defaultCreditPointsMan`) | 2.25 | Medium-High | נקודות זיכוי תושב ישראל: גבר 2.25, אישה 2.75 | Secondary sources agree. Not checked on gov.il |
| 9 | Default credit points, woman (`defaultCreditPointsWoman`) | 2.75 | Medium-High | same | Secondary sources agree (a woman gets 0.5 more than a man). Not checked on gov.il |
| 10 | Surtax threshold (`surtaxAnnualThreshold`) | ₪721,560 / year | Medium-High | מס יסף 2026 סכום סף. Frozen by law through 2027 | PwC (last reviewed 29 Jun 2026): "ILS 721,560 in 2026". Matches. The employer's supplement quotes the same number |
| 11 | Surtax rate (`surtaxRate`) | 3% on income above the threshold | High | מס יסף 3% | PwC: "3% surtax ... exceeding ILS 721,560". Matches |
| 12 | Extra surtax on capital income (`surtaxCapitalIncomeExtraRate`) | +2% on the capital-income part above the threshold (from 2025) | Medium-High | מס יסף הכנסה הונית 2% | PwC: "as of 2025 ... additional surtax of 2%" on capital income above ₪721,560 in 2026. Matches |
| 13 | Capital-gains rate (`capitalGainsRate`) | 25% on the **real** (inflation-adjusted) gain | High | מס רווח הון 25% רווח ריאלי; קופת גמל להשקעה | PwC: 25% on the real gain of shares bought from 2003, 30% for a holder of 10% or more. Matches |
| 14 | Qualifying-annuity ceiling (`qualifyingAnnuityMonthlyCeiling`) | ₪9,430 / month | **Confirmed** | תקרת קצבה מזכה 2026; סעיף 9א לפקודת מס הכנסה | 2026-10-27: the Tax Authority's guideline letter of 2 Feb 2026 on the 9A exemption (read at a payroll company's mirror, not gov.il) gives ₪9,430. Matches |
| 15 | Fixed exemption share by year (`qualifyingAnnuityFixedExemptionSchedule`) | 22% (2025), **22.5% (2026)**, **27.5% (2027)**, **32% (2028 onward)**; the last rate is kept for later years | **Confirmed** | תיקון 275 (published 22.12.24); הנחיה למשלמי קצבאות פטור 9א. The step from 2025 to 2026 is only +0.5 points, and that is what the law says | Same Tax Authority letter: additional exemption 22% (2025), 22.5% (2026), 27.5% (2027), 32% (2028 on). Matches, including the small 2026 step |
| 16 | Conditional exemption share (`qualifyingAnnuityConditionalExemptionRate`) | 35% (so the total is 57% in 2025, 57.5% in 2026, 62.5% in 2027 and 67% from 2028) | **Confirmed** | same. The engine uses the share of each calendar year (the year comes from the computer's clock, `baseYear` in `household.ts`) | Same letter: base exemption 35%, totals 57% / 57.5% / 62.5% / 67%, and a maximum exemption of ₪5,422 a month in 2026 (57.5% × 9,430). Matches |
| 17 | Severance offset (`severanceExemptionFactor` / `severanceExemptionMonths`) | Each tax-free severance shekel withdrawn cuts the conditional exemption by 1.35 / 180 per month | **Low** | קיזוז הון פטור קצבה מזכה; קיבוע זכויות (rights fixation, טופס 161ד); "הון פטור × 1.35 / 180" | |
| 18 | Health tax on an early pension, reduced rate (`healthTaxReducedRate`) | 3.23% on the part up to the bracket below | **Verified** on btl.gov.il, 2026-10-27 | דמי ביטוח בריאות מקצבה לפני גיל פרישה (the BTL page "שיעורי דמי ביטוח בריאות": https://www.btl.gov.il/Insurance/Health_Insurance/Pages/שיעורי%20דמי%20ביטוח%20בריאות.aspx). Rates change from 1 January; the page lists 3.23% from 01.01.2025 | |
| 19 | Health tax, full rate (`healthTaxFullRate`) | 5.17% above the bracket | **Verified** on btl.gov.il, 2026-10-27 | same page (the 5.17% applies from 01.02.2025) | |
| 20 | Health tax bracket (`healthTaxReducedBracketMonthly`) | ₪7,703 / month (2026) | **Verified** on btl.gov.il, 2026-10-27 | same page. The bracket is indexed each January, so refresh it yearly. The app keeps it fixed in today's money | |
| 21 | Section 102 holding period (`section102HoldingPeriodYears`) | 2 years (24 months) after the grant, in a trustee, for the capital-gains route | Medium. The source is an employer's plan supplement, not the Tax Authority | סעיף 102 מסלול רווח הוני תקופת החסימה 24 חודשים; סעיף 102(ב)(2) | |
| 22 | Section 102 split of a qualifying sale (`sources.ts`, `employerStockRoute`, `splitEquityByTaxRoute`) | **Ordinary income** = the lower of (grant-date value) and (sale proceeds), less acquisition cost; taxed at the marginal rate. **Capital gain** = proceeds above that, taxed at the capital-gains rate | Medium. Same employer supplement | סעיף 102 "הכנסת עבודה" לעומת "רווח הון"; שווי המניה במועד ההענקה (ממוצע 30 ימי המסחר שלפני ההענקה) | |
| 23 | Disqualifying disposal (`ordinaryIncome` treatment) | A sale or transfer before the 24 months ends is taxed in full as ordinary income (no capital-gains part) | Medium. Same supplement | סעיף 102 "הפרת תנאי" / "מכירה לפני תום תקופת החסימה" | |
| 24 | Capital-gains rate for Section 102 shares | 25% (the same `capitalGainsRate` as row 13). A holder of 10% or more of the company pays 30% | Medium. The 30% is **not modeled** | מס רווח הון בעל מניות מהותי 30% | PwC confirms the general 25% / 30% rates for shares (row 13). That Section 102 uses the same rate comes from the employer supplement only |
| 25 | Surtax on these shares | The ordinary part counts towards the 3% surtax above ₪721,560 a year. The extra 2% applies to the capital-gain part only. Both match rows 10-12; the employer supplement quotes the same threshold and the extra 2% on capital income from 2025 | Medium-High | מס יסף הכנסה הונית 2025; ראו שורות 10-12 | Rows 10-12 are confirmed by PwC |
| 26 | Bituach Leumi on the Section 102 ordinary part, reduced rate (`nationalInsuranceReducedRate`) | 1.04% on the part up to ₪7,703 a month (the same bracket as row 20) | **Verified** on btl.gov.il, 2026-10-27 | שיעורי דמי ביטוח לאומי לשכיר; the BTL page "שיעורי דמי ביטוח לשכירים" | Confirmed by the assistant on 2026-10-27: employee Bituach Leumi 1.04% plus health 3.23% = 4.27% up to the bracket |
| 27 | Bituach Leumi on the Section 102 ordinary part, full rate (`nationalInsuranceFullRate`) | 7% on the part above the bracket, up to the ceiling below. With health tax (5.17%) that is 12.17% | **Verified** on btl.gov.il, 2026-10-27 | same page | Confirmed by the assistant on 2026-10-27 |
| 28 | Maximum insured income (`contributionCeilingMonthly`) | ₪51,910 / month. Nothing is paid on income above it | **Verified** on btl.gov.il, 2026-10-27 | הכנסה מרבית לביטוח (ההכנסה המרבית החייבת בדמי ביטוח) | Confirmed by the assistant on 2026-10-27. Indexed each January, so refresh it yearly |

### Rules and interpretations in the tax engine (not single numbers)

These are modeling choices. Confirm that each reflects the law, or tell us
what to change.

| # | Assumption | Where | Confidence | What to check |
|---|---|---|---|---|
| A | The qualifying-annuity exemption starts at the Bituach Leumi statutory retirement age (men 67, women 62-65 by birth year) | `netIncome.ts` (`exemptionApplies`) | Medium | Age from which the קצבה מזכה exemption applies |
| B | Regular provident funds (קופת גמל) and IRA provident funds are taxed as pension income | `sources.ts` | Medium | Tax on kupat-gemel withdrawals taken as an annuity vs as a lump sum |
| C | Investment provident funds (קופת גמל להשקעה) and other investments pay 25% on the real gain only | `sources.ts`, `drawdown.ts` | Medium-High | Tax on withdrawals from קופת גמל להשקעה |
| D | Study fund (קרן השתלמות) withdrawals are tax-free | `sources.ts` | Medium | Conditions for the exemption (6-year liquidity, deposit ceilings, withdrawal ceilings) |
| E | The Bituach Leumi old-age pension is tax-free | `sources.ts` | High | Taxation of the old-age pension (קצבת זקנה פטורה ממס) |
| F | Each spouse is taxed separately, with their own credit points; no joint assessment or spreading | `household.ts`, `netIncome.ts` | Medium | Whether a couple can benefit from joint filing |
| G | Today's rates and brackets apply to every future year, in today's money. The one exception is the exemption share, which follows the year-by-year schedule in row 15 | `taxRates.ts` | Medium | Brackets, credit points, the exemption ceiling and the health-tax bracket are CPI-indexed each January; the surtax threshold is frozen through 2027 |
| H | Capital-gains cost basis = today's balance plus future deposits, so gains that already exist are understated | `drawdown.ts` | By design | Not a law question; enter an investment's own rate or basis if you know it |
| I | Health tax (rows 18-20) is charged on **all pension-taxed income** (annuities and withdrawals from pension-like accounts) while a person is younger than the statutory retirement age. The BTL page describes an early *pension*; we apply the same rates to pension-like withdrawals | `netIncome.ts` (`beforeStatutoryAge`), `tax.ts` | Medium | Health tax on kupat-gemel withdrawals and on pension taken before the statutory age; whether the rate on the part above the bracket applies to the whole income |
| J | **No** health tax on a *pension* from the statutory retirement age (health tax on the Section 102 ordinary part is separate: see rule Q) | `netIncome.ts` | Medium (secondary source, e.g. ig-tax; the BTL page does not say) | Health tax on a pension received at or after the statutory age (דמי ביטוח בריאות מקצבה אחרי גיל פרישה) |
| K | The calendar year of each retirement year is the current year (from the computer's clock) plus the years from now. Tests pin the clock to 2026-06-15 | `household.ts` (`baseYear`), `test/setup.ts` | By design | Not a law question |
| L | The remaining monthly exemption the user enters (from the rights fixation) is used as entered in every year, even though the exemption shares grow after 2026 | `tax.ts` | By design (conservative) | Whether a rights-fixation allowance grows with the exemption shares |
| M | Early-retirement health tax ignores its exceptions: widows with a survivors' allowance, people with a disability allowance of 75% or more, and a non-working married woman whose husband is insured (she may file a declaration). It also ignores the upper income cap and health tax on non-pension income (such as capital gains) before the statutory age | `tax.ts` | Medium | The "פטור" paragraphs on the BTL health insurance page; if one applies to you, the app overstates your tax |
| N | Employer-granted stock is split out of the investments bucket by its tax track, one lot per vesting batch plus the remaining shares. A missing track counts as the Section 102 capital-gains route. Section 102 ordinary-income track shares, and capital-route lots that do not meet the 24 months, are taxed entirely as ordinary income. Section 3(i) shares are not split into a separate bucket: they stay in the investments bucket with the grant value as cost basis (25% on the growth above it) | `sources.ts` (`stockRoute`, `employerLots`, `splitEquityByTaxRoute`) | Medium | Rows 21-25 |
| O | A lot's grant-date value is its quantity × the per-share price at grant × the fallback USD/ILS rate, and never more than the lot's current value. The price is the batch's own "Price at grant" or, if empty, the holding's "Share price at grant" (stored as `costBasisAtGrantUSD`). Acquisition cost is taken as 0 (stock awards), so options with a strike price are overstated. The value is fixed in today's money (not adjusted for inflation or currency), so a rising share price shifts the gain, not the ordinary part. A missing price counts as 0, so the whole value is taxed as a capital gain (the lowest tax) | `sources.ts` (`employerLots`) | By design | Enter the real per-share price at grant; check the Tax Authority's grant-date value rule if the plan uses a 30-day average |
| P | **Vesting batches (interpreted).** A batch's vest date is taken as its acquisition date and starts its own 24-month period, because the employer supplement counts the holding period from the acquisition of the shares. Shares not covered by any batch follow the holding's grant date. The 24 months are met if the user ticks "24-month trustee holding period met" (for those remaining shares only), the date is missing or unreadable, or retirement (taken as the sale date) is at least 24 months after the date. A batch with no date counts as met. A batch vesting after retirement is routed as ordinary income (the tool tells the user to leave out shares that are usually forfeited). If the batches add up to more than the holding's quantity, they are scaled down to fit. Batches only split the tax route: net worth and the drawdown use the holding's full quantity | `sources.ts` (`stockRoute`, `employerLots`) | By design | Whether your plan counts the 24 months from the grant date or from each vest date. The supplement says "acquisition", which for RSUs is normally the vest date, but confirm with your trustee |
| Q | Ordinary income from shares is added to the person's pension income for the brackets, with credit points applied once. It gets **no** pension exemption. It does pay **health tax at any age** and **Bituach Leumi before the statutory retirement age** (rows 26-28): the ordinary slice is stacked on top of the early pension and only the part below the ₪51,910 ceiling pays, at the reduced rates up to ₪7,703 and the full rates above. The contributions are not deducted from taxable income in the model. As the shares are sold in retirement, the grant-date part is a fixed layer that shrinks pro rata with withdrawals, and growth above it is a capital gain | `tax.ts` (`employerShareContributions`), `netIncome.ts`, `drawdown.ts` | Medium | The BTL retirement-age row of the employee table lost its label in extraction, so "health only from the statutory age" is interpreted. Check it, and whether the employee's share of the contributions is tax-deductible |

### Not modeled (so nothing to verify yet)

Bituach Leumi contributions other than those on Section 102 shares (for
example on work income or on non-pension income before the statutory age),
health tax on income other than a pension or Section 102 shares, other credit
points (children, new immigrants, disability), a credit-points breakdown
helper, the gemel-to-annuity exemption, old lump-sum gemel rules,
early-withdrawal penalty tax, tax planning between spouses (for example
shifting withdrawals to the spouse with the lower rate).

For employer stock: the 30% capital-gains rate for a holder of 10% or more,
unvested shares (enter them as a batch with a date only if they will vest
before retirement), options with a strike price, ESPP discounts (ESPP is taxed
like any other investment), the deduction of employee contributions from
taxable income, and inflation or currency adjustment of the grant value.

## 2. Bituach Leumi constants (`app/src/domain/bituachLeumiRates.ts`, as of 2026-01-01)

Verified directly on btl.gov.il on 2026-10-26, so these need only a yearly
refresh. Pages: `/benefits/old_age/Shum/Pages/Shum.aspx` (amounts),
`.../Shum/Pages/Tosafot.aspx` (supplements), `.../gilPrisha.aspx` (ages),
`.../t-dchiyatkitsba.aspx` (deferral).

| Constant | Value | Status |
|---|---|---|
| Basic monthly pension, single | ₪1,838 | Verified |
| Seniority supplement | 2% per full insured year, max 50% | Verified |
| Deferral supplement | 5% per year deferred | Verified |
| Men's retirement age / universal age | 67 / 70 | Verified |
| Qualifying period | 144 months, or 60 of the last 120 | Verified |
| Spouse supplement | ₪924 / month | Verified |
| Income-supplement guarantee, single under 70 / couple | ₪4,375 / ₪6,912 | Verified (used as a hint only) |
| Women's retirement age table (born 1960-69) | 62y4m ... 64y9m | Verified |
| Default insurance start age when no insured years are entered | 21 | Our assumption |
| Spouse income-test threshold | **not found on the official page**, not modeled | Open: find the income limit for the spouse supplement (תוספת בן/בת זוג, מבחן הכנסות) |

## 3. Savings access rules (`app/src/domain/accessRules.ts`, validated 2026-10-26)

Cross-checked from secondary sources (Bizportal, btl.gov.il, nevo.co.il).
gov.il and Kol-Zchut could not be read.

| Rule | Value used | Confidence | What to look up |
|---|---|---|---|
| Earliest age to draw pension, managers insurance, provident fund (kitzba) | 60, men and women | High (pension, gemel); Medium (managers insurance) | גיל משיכה מקופת גמל / קרן פנסיה / ביטוח מנהלים |
| Study fund liquidity | 6 years after the first deposit | High | קרן השתלמות נזילות 6 שנים |
| Investment provident fund | Accessible at any time | High | קופת גמל להשקעה |
| Annual study-fund deposit ceiling (not modeled yet) | ₪15,712 / month salary, frozen through 2027 | Medium | תקרת הפקדה לקרן השתלמות |

Rules found but **deliberately not modeled** (unverified): the
minimum-pension threshold that limits early lump sums (reported as 32.5% of
the average wage), the study-fund "3 years at retirement age" exception,
official annuity conversion-factor tables (only a user-entered factor is
used), and the provident-fund rule that post-2008 deposits must be taken as
an annuity (the model draws provident funds as capital from 60).

## Log of checks

Add a line each time you verify something, so the next session knows what is
settled.

| Date | Item # | Source URL | Result (confirmed / changed to ...) |
|---|---|---|---|
| 2026-10-27 | 18-20 | btl.gov.il, health insurance rates page (URL in row 18) | Confirmed by the assistant: 3.23% up to ₪7,703 and 5.17% above, for early-pension recipients. No statement about pension after the statutory age (see rule J) |
| 2026-10-27 | 15-16 | Secondary sources (Tax Authority guidance to payers of 20.1.25 as quoted by payroll sites; yuvalim-ins table) | Schedule 22% / 22.5% / 27.5% / 32% additional exemption, 57% / 57.5% / 62.5% / 67% in total. Superseded by the next line |
| 2026-10-27 | 14-16 | Tax Authority guideline letter of 2 Feb 2026 on the 9A annuity exemption (PDF `ptormas2026.pdf`, read at a payroll company's site, not gov.il) | **Confirmed**: ceiling ₪9,430, base 35%, additional 22% / 22.5% / 27.5% / 32%, totals 57% / 57.5% / 62.5% / 67%, maximum exemption ₪5,422 a month in 2026. The odd +0.5 step for 2026 is in the law (Amendment 275) |
| 2026-10-27 | 1-6, 10-13 | PwC Worldwide Tax Summaries, Israel: individual taxes on personal income (https://taxsummaries.pwc.com/israel/individual/taxes-on-personal-income, last reviewed 29 June 2026) and income determination | Annual 2026 brackets ₪84,120 / 120,720 / 228,000 / 301,200 / 560,280 = our monthly figures × 12; 47% to ₪721,560; 3% surtax above ₪721,560 (50% top rate); +2% surtax on capital income from 2025; 25% capital gains, 30% for a 10% shareholder. All match the code. finav.co.il (citing the Tax Authority NAV26 table) agrees. One SEO blog (naama-tax.co.il) lists older 2025 brackets; ignored. Gov.il, taxes.gov.il and kolzchut still refuse automated requests, so the Tax Authority table itself was **not** read |
| 2026-10-27 | 7-9 | finav.co.il and other secondary sources | Credit point ₪242 a month and 2.25 / 2.75 points agree. Not on PwC, not read on gov.il: still worth a manual look |
| 2026-10-27 | 26-28 | btl.gov.il, employee contribution rates page | Confirmed by the assistant: Bituach Leumi 1.04% / 7%, health 3.23% / 5.17%, reduced bracket ₪7,703, maximum insured income ₪51,910. The label of the retirement-age row was lost in extraction (rule Q) |
| 2026-10-27 | 17 | none | Not checked. Still **Low** confidence: confirm the severance-offset formula with your pension provider or tax adviser |
| 2026-10-27 | 21-25 | The user's employer plan supplement for Israeli equity awards (Section 102, capital-gains route) | Rules taken from that text as given: 24 months in trust, ordinary part = the lower of grant value and proceeds, the rest is a capital gain, early sale is all ordinary income, 3% surtax plus 2% on capital income above ₪721,560, and Bituach Leumi on the ordinary part up to the ceiling. Not yet checked against the Tax Authority or the Ordinance |
| | | | |
