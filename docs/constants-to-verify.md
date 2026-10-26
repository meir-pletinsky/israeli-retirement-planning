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
| 15 | Fixed exemption share (`qualifyingAnnuityFixedExemptionRate`) | 22.5% | Medium | אחוז פטור קצבה מזכה 2026 | |
| 16 | Conditional exemption share (`qualifyingAnnuityConditionalExemptionRate`) | 35% (so 57.5% in total in 2026) | Medium | same. Check the total for 2026 and the planned steps for 2027 (reported 62.5%) and 2028 (reported 67%). We do **not** model the steps | |
| 17 | Severance offset (`severanceExemptionFactor` / `severanceExemptionMonths`) | Each tax-free severance shekel withdrawn cuts the conditional exemption by 1.35 / 180 per month | **Low** | קיזוז הון פטור קצבה מזכה; קיבוע זכויות (rights fixation, טופס 161ד); "הון פטור × 1.35 / 180" | |

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
| G | Today's rates and brackets apply to every future year, in today's money | `taxRates.ts` | Medium | Brackets and credit points are CPI-indexed each January; the surtax threshold is frozen through 2027 |
| H | Capital-gains cost basis = today's balance plus future deposits, so gains that already exist are understated | `drawdown.ts` | By design | Not a law question; enter an investment's own rate or basis if you know it |

### Not modeled (so nothing to verify yet)

Health tax and Bituach Leumi contributions on retirement income, other
credit points (children, new immigrants, disability), the gemel-to-annuity
exemption, old lump-sum gemel rules, early-withdrawal penalty tax, tax
planning between spouses, the 2027-28 exemption steps.

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
| | | | |
