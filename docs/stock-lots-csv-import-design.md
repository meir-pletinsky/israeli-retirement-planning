# Bulk import of stock purchases and grants (CSV) — design

Status: **proposal, 2026-10-31. Nothing is built.** It came from the user's question: "If I
want to help the user bulk-load the history of stock purchases and grants (ESPP, EOSP and
private), for example from a CSV file, what is the minimum data in each row?" Every number
and symbol in this file is an invented example.

**The import changes no calculation by itself.** It fills the same fields the stock dialog
fills today (`purchaseLots`, `vestingTranches`, the grant details). Section 3 lists two
gaps in the engine that already exist and that an import makes easier to hit.

## 1. Short answer

A row needs **`type`, `symbol`, `date`, `quantity`**. `type` is ESPP, EOSP or PRIVATE: without
it the app cannot tell the three paths apart, and one symbol can sit in several of them.
The price can be optional, but only because the app can often fill it, and a missing price
is not equally harmless on each path (section 3).

| | ESPP | PRIVATE | EOSP (RSU-style grant) |
|---|---|---|---|
| `date` is | purchase date | purchase date | **grant date** |
| `price_usd` is | market price that day (the discount was taxed as salary and is not part of it) | price paid per share | price at grant, as the plan defines it |
| Where a row goes | a purchase lot | a purchase lot | a vesting batch of the grant |

## 2. Scope

- **Included:** USD shares that are held now, for the three categories the stock dialog has:
  `employerEsppDiscount`, `personalBrokeragePurchase`, `employerGrantedStock`.
- **Not included:** options with a strike price (the user kept them out of scope earlier),
  other currencies, sold shares (see 10.1), any change to how the engine taxes a holding.
- **Where it lives:** a new import page next to the Clearing House one (for example
  `/import/stock-lots`), opened from the stock step in My Data with a "Download template"
  link. The file is read in the browser and never uploaded. Like the Clearing House import,
  nothing changes until the user reviews and ticks what to import.

## 3. What the app stores and what the engine reads today

Checked in the code on 2026-10-31 (`types/index.ts`, `domain/sources.ts`,
`domain/purchaseLots.ts`, `domain/vesting.ts`).

| Path | Stored as | What the engine reads |
|---|---|---|
| PRIVATE | one `StockHolding` with `purchaseLots[]` (`purchaseDate`, `quantity`, `priceUSD`, `usdToIlsRate`) | Rule R lot by lot: the lower of the shekel gain and the dollar gain. A lot counts only with a quantity above 0 and a price of 0 or more. With no usable lot, the single field `personalPurchaseDetails.unrealizedCapitalGainUSD` × the rate (blank counts as 0). |
| ESPP | the same, with `purchaseLots[]` | The same lots. **With no usable lot the engine reads the same personal field, which the ESPP form does not show.** The ESPP form's "capital gains on growth" field is not read by any calculation. |
| EOSP | one holding **per grant**: `grantDate`, `taxTrack` and `costBasisAtGrantUSD` are on the holding; one `VestingTranche` per batch (`vestDate`, `quantity`, optional own `grantPriceUSD`) | The batch's price at grant sets the part of its value that is ordinary income. A batch with no vest date, and any shares not in a batch, are already vested. Batches that together exceed `quantity` are scaled down. |

Two gaps that already exist, and that a bulk import can hit on many holdings at once:

1. **A blank price on an ESPP or PRIVATE lot makes the tax too low.** The lot is ignored,
   and the fallback gain is 0 (an ESPP holding has no other way to get a gain).
2. **A blank price at grant counts as 0.** On the Section 102 capital-gains route the
   ordinary-income layer is then 0 and the whole value is taxed at the flat rate, so the tax
   is too low. On Section 3(i) the "already taxed" part is 0 and the tax is too high. On the
   ordinary-income route the price does not matter.

A blank **rate** is different and safe: the lot then uses the sale rate, so the two gain
measures agree and the tax can only be equal or too high (too high when the dollar has
fallen since the purchase).

So the import must never leave a missing price unseen (section 7).

## 4. File format

One header row, one data row per **lot**: a purchase for ESPP and PRIVATE, a vesting batch
for EOSP. UTF-8, with or without a byte-order mark. The delimiter is detected (comma,
semicolon or tab), because Excel in Israel writes semicolons. Column names are
case-insensitive; unknown columns are ignored and listed on the review screen.

| Column | Required | Meaning |
|---|---|---|
| `type` | yes | `ESPP`, `EOSP` or `PRIVATE`. Aliases are mapped (RSU, ESOP, 102, grant → EOSP; brokerage, personal → PRIVATE). A value that is not recognised is flagged and the user maps it once. |
| `symbol` | yes | Ticker, trimmed and upper-cased. Share-class spelling (BRK.B or BRK-B) follows the price lookup's mapping. |
| `date` | yes | ESPP and PRIVATE: purchase date. EOSP: grant date. `YYYY-MM-DD` is preferred. A day-first date (`31/03/2024`) is accepted; if the whole file is ambiguous (every date has a first part of 12 or less) the user picks the order once. |
| `quantity` | yes | Shares in this lot that are **still held**, above 0. Fractions allowed. |
| `price_usd` | no | By type, see section 1. Empty means "not known"; `0` means a real price of zero (a gift). |
| `fx_rate` | no | Shekels per dollar on `date`. Empty means "look it up". |
| `vest_date` | no, EOSP only | Date this batch vests. Empty means already vested. |
| `tax_track` | no, EOSP only | `102-capital`, `102-ordinary` or `3i`. Empty leaves the track blank, which the engine reads as the Section 102 capital-gains route. |
| `broker` | no | Becomes the holding's broker or custodian. |
| `currency` | no | If present, only `USD` is accepted. |

Numbers: a dot is the decimal mark; `$` and thousands commas are stripped. A comma used as a
decimal mark is rejected with a clear message, not guessed.

Example (invented symbols and numbers):

```csv
type,symbol,date,quantity,price_usd,vest_date,broker
EOSP,ACME,2023-03-01,40,150.00,2024-03-01,BrokerA
EOSP,ACME,2023-03-01,40,150.00,2025-03-01,BrokerA
EOSP,ACME,2023-03-01,40,150.00,,BrokerA
ESPP,ACME,2024-06-30,12,,,BrokerA
PRIVATE,ZETA,2021-05-10,25,80.50,,BrokerB
PRIVATE,ZETA,2022-11-02,10,,,BrokerB
```

Meaning: one grant of 120 ACME shares with two batches still to vest and 40 already
vested; one ESPP purchase of 12 shares with no price yet; two ZETA purchases, the second
with no price yet.

## 5. How rows become holdings

Rows are grouped, then each group becomes one holding.

| Group key | Holding |
|---|---|
| ESPP and PRIVATE: type + symbol + broker | One holding. Each row is a `PurchaseLot` (`purchaseDate`, `quantity`, `priceUSD`, `usdToIlsRate`). Holding `quantity` = the sum of the lots. |
| EOSP: symbol + **grant date** + broker | One holding per grant. `grantDate`, `costBasisAtGrantUSD`, `usdToIlsRateAtGrant` and `taxTrack` are set on it. A row with a `vest_date` becomes a `VestingTranche`; a row without one adds to the holding `quantity` only (already vested). If one grant's rows carry different prices, each batch keeps its own `grantPriceUSD` and the row is flagged. |

Both: `companyName` and `currentMarketPriceUSD` come from the price files when the symbol is
in them. The simple entry fields (single date, price and rate) stay empty, because the lots
replace them, as in R4.

Not imported, and said so on the review screen: "keeps vesting after leaving" and "holding
period met". The file cannot know them. They stay at their defaults, so unvested batches
count as lost on leaving, which is the cautious reading (R3).

**An existing holding with the same category, symbol and broker** is never changed silently.
The review screen offers "skip" (the default), "replace its lots (or vesting batches)" and
"add as a separate holding".

## 6. Filling in a missing price or rate

All of it reuses what the stock dialog already does (Phase T and the rate lookup), and a typed
or imported value always wins.

- **Price, S&P 500 symbol, date inside the data:** filled with the close on the last trading
  day on or before the date (`priceOnOrBefore`, up to 10 days back), marked "estimated" with
  that trading day.
- **Price, any other symbol (for example Israeli employers) or a date outside the data:**
  stays empty. The lot is shown as **needs price**.
- **Rate:** the Bank of Israel rate by date (`loadUsdIlsRate`), only when the lookup is
  turned on in Settings. Today that is one request per distinct date, answered once per
  session. A big file needs a small request limit, or a range request if the service offers
  one (to check).
- **Current price:** the latest close for S&P 500 symbols. For other symbols the CSV has no
  column (it is one value per symbol, not per row), so the review screen asks for it per
  symbol. Without it the holding is worth 0 until it is typed.

Known weaknesses of the filled price (details in `stock-price-data-design.md`):

- The dataset's close is adjusted for **dividends and splits**, so an old price of a dividend
  payer is too low (KO about −30% for 2015). A low cost raises the computed gain, so the
  tax is **too high**, the cautious direction. Rows filled this way carry the "estimated"
  mark, and the review screen says to prefer the broker's cost per share.
- If a row's quantity is the quantity **at the time** while the filled price is
  split-adjusted, the cost is wrong by the split ratio. The importer cannot see splits. The
  help text says to take quantities and costs from the broker's report of lots held now,
  where both agree.
- For EOSP the plan decides what "price at grant" means. At least one large US employer uses
  the **30-trading-day average** (see row 22 in `constants-to-verify.md`). The filled value
  is the grant-day close, as in the stock dialog today, and is marked as an estimate. A
  30-day average computed from the price file is a possible later step.

## 7. Row checks and the review screen

Per row, one of: **ready**, **estimated** (price or rate filled in), **needs price**, **error**.

Errors (the row is left out, with the line number and reason): missing or unknown `type`;
no symbol; a date that cannot be read or that is in the future (a `vest_date` may be in the
future); a quantity that is not above 0; a negative price; a currency other than USD.

Warnings (the row is kept): an identical row seen twice (the user may have meant it, so it
is not dropped); the same grant with different prices; a lot dated before the symbol's first
price.

The review screen shows, before anything changes:

1. File summary: rows read, ready, estimated, needs price, errors.
2. A table of holdings to create or replace, expandable to its lots, with the price and rate
   cells editable in place.
3. A **needs price** list, with a plain sentence for each path about what the tax will do
   until it is filled (section 3). The user can apply anyway and finish later; the lot
   editor already counts incomplete lots.
4. Symbols with no current price.
5. Matches with existing holdings and the choice for each.
6. A tick per holding, and one "Import" button.

## 8. Privacy

The file never leaves the browser. The only requests are the ones the stock dialog already
makes: the price file of each symbol in the file (this tells the host which tickers the user
holds, as today) and, with the lookup on, the rate of each date. Real broker files are never
committed; tests use invented rows.

## 9. Proposed steps

- **S1, domain (pure, tested):** CSV reader (the project's RFC 4180 reader lives in
  `app/scripts/stock-data/csv.ts`, outside `src`, so it is moved to a shared place or
  copied), header and alias handling, validation, grouping, mapping to `StockHolding`.
- **S2, page:** the import page, review table, apply, the template download, texts in en,
  he and ru.
- **S3, autofill:** prices, rates, current prices and the "estimated" marks, with the
  request limit.
- **S4, later:** `sell` rows consumed FIFO (rule S in `constants-to-verify.md`, see 10.1), broker
  presets from real sample exports, Hebrew column names, the 30-day average for EOSP.

Separate small follow-up, worth doing with or before S2: a **data-completeness warning**
for a holding that has no usable cost basis (the two gaps in section 3), shown in the form
and on the dashboard. It would help hand-typed data as much as imported data.

## 10. Limits and open questions

### 10.1 Sold shares

The model keeps the shares held now. If lots add up to more than the holding's quantity,
they are scaled down **in proportion**, which is not FIFO (the legal rule when the seller
cannot show a specific lot). A full history that includes sold shares would therefore be
distorted. So the first version takes only lots **still held**, for example a broker's
"unrealized gains by lot" report, and not the transaction history. A later step can accept
`sell` rows and consume the oldest lots first.

### 10.2 Questions for the user (not answered yet)

1. First version: open lots only (recommended), or also `sell` rows with FIFO?
2. A lot with no price: allow the import and flag it (recommended), or block until every
   price is there?
3. An EOSP grant with no price: fill the grant-day close and mark it (what the stock dialog
   does), or leave it empty so the user must decide?
4. When a holding with the same category, symbol and broker exists: is "skip" the right
   default?
5. Which brokers does the user have? A preset is cheap once there is a real sample export
   to base it on (kept out of the repository, with a synthetic copy for tests).

## 11. Test plan

- **Reader:** byte-order mark, quoted fields, doubled quotes, line breaks inside quotes,
  CRLF, semicolons and tabs, an empty cell versus `0`, a short row, blank lines.
- **Validation:** each error and warning in section 7; day-first and ISO dates; the
  ambiguous-file case.
- **Mapping:** the profile from a CSV equals the profile built by hand with the same lots,
  field by field, and gives the same engine result for each path; EOSP rows with and without
  a vest date; a grant with two prices; replace versus add.
- **Autofill:** with a fake price index and rate source: filled, outside the data, a typed
  value kept, lookup off, offline, a weekend date.
- **Page:** review, editing a price in place, ticks, apply, no change before the click;
  texts in en, he and ru match; amounts and dates isolated for right-to-left.
