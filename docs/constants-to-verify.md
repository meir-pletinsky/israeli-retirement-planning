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
| 1 | Bracket 1 upper limit (`monthlyBrackets[0]`) | 10% up to ₪7,010 / month | Medium | מדרגות מס הכנסה 2026 | |
| 2 | Bracket 2 | 14% up to ₪10,060 | Medium | same | |
| 3 | Bracket 3 | 20% up to ₪19,000 | Medium | same | |
| 4 | Bracket 4 | 31% up to ₪25,100 | Medium | same | |
| 5 | Bracket 5 (**highest risk**) | 35% up to **₪46,690** | Medium-Low | same; sources disagreed on the 5th/6th boundary. Older material says ₪53,970 (a 2022-23 value). We used 46,690 because of a legislated widening reported for 2026 | |
| 6 | Top rate | 47% above bracket 5 | High | same | |
| 7 | Credit point value (`creditPointMonthlyValue`) | ₪242 / month | Medium | ערך נקודת זיכוי 2026. The 2025 value was reported inconsistently (₪235 vs ₪242) | |
| 8 | Default credit points, man (`defaultCreditPointsMan`) | 2.25 | Medium-High | נקודות זיכוי תושב ישראל: גבר 2.25, אישה 2.75 | |
| 9 | Default credit points, woman (`defaultCreditPointsWoman`) | 2.75 | Medium-High | same | |
| 10 | Surtax threshold (`surtaxAnnualThreshold`) | ₪721,560 / year | Medium | מס יסף 2026 סכום סף. Frozen by law through 2027 | |
| 11 | Surtax rate (`surtaxRate`) | 3% on income above the threshold | Medium-High | מס יסף 3% | |
| 12 | Extra surtax on capital income (`surtaxCapitalIncomeExtraRate`) | +2% on the capital-income part above the threshold (from 2025) | Medium | מס יסף הכנסה הונית 2% | |
| 13 | Capital-gains rate (`capitalGainsRate`) | 25% on the **real** (inflation-adjusted) gain | High | מס רווח הון 25% רווח ריאלי; קופת גמל להשקעה | |
| 14 | Qualifying-annuity ceiling (`qualifyingAnnuityMonthlyCeiling`) | ₪9,430 / month | Medium | תקרת קצבה מזכה 2026; סעיף 9א לפקודת מס הכנסה | |
| 15 | Fixed exemption share by year (`qualifyingAnnuityFixedExemptionSchedule`) | 22% (2025), **22.5% (2026)**, **27.5% (2027)**, **32% (2028 onward)**; the last rate is kept for later years | Medium | תיקון 190; "שיעור הפטור הנוסף" 2027 27.5%; הנחיה למשלמי קצבאות פטור 9א 2025 (Tax Authority letter of 20.1.25). The step from 2025 to 2026 is only +0.5 points, which looks odd: confirm it first | |
| 16 | Conditional exemption share (`qualifyingAnnuityConditionalExemptionRate`) | 35% (so the total is 57% in 2025, 57.5% in 2026, 62.5% in 2027 and 67% from 2028) | Medium | same. Check each year's total, and that the 35% base is unchanged. The engine uses the share of each calendar year (the year comes from the computer's clock, `baseYear` in `household.ts`) | |
| 17 | Severance offset (`severanceExemptionFactor` / `severanceExemptionMonths`) | Each tax-free severance shekel withdrawn cuts the conditional exemption by 1.35 / 180 per month | **Low** | קיזוז הון פטור קצבה מזכה; קיבוע זכויות (rights fixation, טופס 161ד); "הון פטור × 1.35 / 180" | |
| 18 | Health tax on an early pension, reduced rate (`healthTaxReducedRate`) | 3.23% on the part up to the bracket below | **Verified** on btl.gov.il, 2026-10-27 | דמי ביטוח בריאות מקצבה לפני גיל פרישה (the BTL page "שיעורי דמי ביטוח בריאות": https://www.btl.gov.il/Insurance/Health_Insurance/Pages/שיעורי%20דמי%20ביטוח%20בריאות.aspx). Rates change from 1 January; the page lists 3.23% from 01.01.2025 | |
| 19 | Health tax, full rate (`healthTaxFullRate`) | 5.17% above the bracket | **Verified** on btl.gov.il, 2026-10-27 | same page (the 5.17% applies from 01.02.2025) | |
| 20 | Health tax bracket (`healthTaxReducedBracketMonthly`) | ₪7,703 / month (2026) | **Verified** on btl.gov.il, 2026-10-27 | same page. The bracket is indexed each January, so refresh it yearly. The app keeps it fixed in today's money | |
| 21 | Section 102 holding period (`section102HoldingPeriodYears`) | 2 years (24 months) after the grant, in a trustee, for the capital-gains route | Medium. The source is an employer's plan supplement, not the Tax Authority | סעיף 102 מסלול רווח הוני תקופת החסימה 24 חודשים; סעיף 102(ב)(2) | |
| 22 | Section 102 split of a qualifying sale (`sources.ts`, `employerStockRoute`, `splitEquityByTaxRoute`) | **Ordinary income** = the lower of (grant-date value) and (sale proceeds), less acquisition cost; taxed at the marginal rate. **Capital gain** = proceeds above that, taxed at the capital-gains rate | Medium. Same employer supplement | סעיף 102 "הכנסת עבודה" לעומת "רווח הון"; שווי המניה במועד ההענקה (ממוצע 30 ימי המסחר שלפני ההענקה) | |
| 23 | Disqualifying disposal (`ordinaryIncome` treatment) | A sale or transfer before the 24 months ends is taxed in full as ordinary income (no capital-gains part) | Medium. Same supplement | סעיף 102 "הפרת תנאי" / "מכירה לפני תום תקופת החסימה" | |
| 24 | Capital-gains rate for Section 102 shares | 25% (the same `capitalGainsRate` as row 13). A holder of 10% or more of the company pays 30% | Medium. The 30% is **not modeled** | מס רווח הון בעל מניות מהותי 30% | |
| 25 | Surtax on these shares | The ordinary part counts towards the 3% surtax above ₪721,560 a year. The extra 2% applies to the capital-gain part only. Both match rows 10-12; the employer supplement quotes the same threshold and the extra 2% on capital income from 2025 | Medium | מס יסף הכנסה הונית 2025; ראו שורות 10-12 | |

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
| I | Health tax (rows 18-20) is charged on **all pension-taxed income** (annuities and withdrawals from pension-like accounts) while a person is younger than the statutory retirement age. The BTL page describes an early *pension*; we apply the same rates to pension-like withdrawals | `netIncome.ts` (`healthTaxApplies`), `tax.ts` | Medium | Health tax on kupat-gemel withdrawals and on pension taken before the statutory age; whether the rate on the part above the bracket applies to the whole income |
| J | **No** health tax on a pension from the statutory retirement age | `netIncome.ts` | Medium (secondary source, e.g. ig-tax; the BTL page does not say) | Health tax on a pension received at or after the statutory age (דמי ביטוח בריאות מקצבה אחרי גיל פרישה) |
| K | The calendar year of each retirement year is the current year (from the computer's clock) plus the years from now. Tests pin the clock to 2026-06-15 | `household.ts` (`baseYear`), `test/setup.ts` | By design | Not a law question |
| L | The remaining monthly exemption the user enters (from the rights fixation) is used as entered in every year, even though the exemption shares grow after 2026 | `tax.ts` | By design (conservative) | Whether a rights-fixation allowance grows with the exemption shares |
| M | Early-retirement health tax ignores its exceptions: widows with a survivors' allowance, people with a disability allowance of 75% or more, and a non-working married woman whose husband is insured (she may file a declaration). It also ignores the upper income cap and health tax on non-pension income (such as capital gains) before the statutory age | `tax.ts` | Medium | The "פטור" paragraphs on the BTL health insurance page; if one applies to you, the app overstates your tax |
| N | Employer-granted stock is split out of the investments bucket by its tax track. A missing track counts as the Section 102 capital-gains route. Section 102 ordinary-income track shares, and capital-route shares that do not meet the 24 months, are taxed entirely as ordinary income. Section 3(i) shares stay in the investments bucket with the grant value as cost basis (25% on the growth above it) | `sources.ts` (`employerStockRoute`) | Medium | Rows 21-25 |
| O | The grant-date value is quantity × the per-share price at grant (the field "Share price at grant", stored as `costBasisAtGrantUSD`) × the fallback USD/ILS rate. Acquisition cost is taken as 0 (stock awards), so options with a strike price are overstated. The value is fixed in today's money (not adjusted for inflation or currency), so a rising share price shifts the gain, not the ordinary part. A missing price counts as 0, so the whole value is taxed as a capital gain (the lowest tax) | `sources.ts` (`grantValueIls`) | By design | Enter the real per-share price at grant; check the Tax Authority's grant-date value rule if the plan uses a 30-day average |
| P | The 24 months are met if the user ticks "24-month trustee holding period met", the grant date is missing or unreadable, or retirement (taken as the sale date) is at least 24 months after the grant date. All shares are treated as one grant: each vesting tranche has its own 24 months | `sources.ts` (`employerStockRoute`) | By design | Whether your plan counts the period from grant or from vesting |
| Q | Ordinary income from shares is added to the person's pension income for the brackets, with credit points applied once. It gets **no** pension exemption and **no** health tax. As the shares are sold in retirement, the grant-date part is a fixed layer that shrinks pro rata with withdrawals, and growth above it is a capital gain | `tax.ts`, `netIncome.ts`, `drawdown.ts` | Medium | Whether Bituach Leumi and health contributions apply (see "Not modeled") |

### Not modeled (so nothing to verify yet)

Bituach Leumi contributions (including those of people who retire before the
statutory age), health tax on income other than a pension, other credit
points (children, new immigrants, disability), a credit-points breakdown
helper, the gemel-to-annuity exemption, old lump-sum gemel rules,
early-withdrawal penalty tax, tax planning between spouses (for example
shifting withdrawals to the spouse with the lower rate).

For employer stock: Bituach Leumi and health contributions on the Section 102
ordinary-income part (up to the contribution ceiling), the 30% capital-gains
rate for a holder of 10% or more, separate vesting dates (each tranche has its
own 24 months), unvested shares, options with a strike price, ESPP discounts
(ESPP is taxed like any other investment), and inflation or currency
adjustment of the grant value.

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
| 2026-10-27 | 15-16 | Secondary sources (Tax Authority guidance to payers of 20.1.25 as quoted by payroll sites; yuvalim-ins table) | Schedule 22% / 22.5% / 27.5% / 32% additional exemption, 57% / 57.5% / 62.5% / 67% in total. Not yet confirmed on gov.il or kolzchut (both refuse automated requests) |
| 2026-10-27 | 21-25 | The user's employer plan supplement for Israeli equity awards (Section 102, capital-gains route) | Rules taken from that text as given: 24 months in trust, ordinary part = the lower of grant value and proceeds, the rest is a capital gain, early sale is all ordinary income, 3% surtax plus 2% on capital income above ₪721,560. Not yet checked against the Tax Authority |
| | | | |
