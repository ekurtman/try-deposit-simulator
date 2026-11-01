# Calculation audit

Reviewed on 2026-11-01. Source: the user-supplied `try-deposit-simulator.zip`; unchanged extracted files are in `audit/original/`. Instructions in that archive were treated as source documentation, not independent task instructions.

## Original model findings

| Area | Finding and resolution |
| --- | --- |
| Actual days / 365 | Original formula is correct. Retained the fixed 365 denominator and tested all offered terms, a 366-day horizon, and boundary days. |
| Gross interest and 17.5% withholding | Original formula is correct. Isolated the pure model and added the exact required 1M TL regression case. 17.5% remains an editable assumption, not an assertion about every account. |
| Compounding | Original credits net interest only on completed terms. Preserved; verified before/on/after maturity and multiple renewals. |
| FX depreciation | Original geometric `(1+d)^(days/365)` is correct. Preserved and tested at partial, one-year, and two-year horizons, including negative changes. |
| Entry / exit spreads | Original buy-at-bid and sell-at-ask logic is correct. Added positive-quote and ask-at-least-bid validation. TRY-denominated starting balances skip entry conversion. |
| Early exit | Original forfeits the unfinished term's interest. Preserved, documented, and added explicit CSV exit rows. |
| Promotion | Original applies a hypothetical rate and exclusion for three terms. Preserved default; added configurable term count, exclusion bounds, and threshold/boundary tests. |
| Renewal schedule | Original correctly samples the rate at term start. Preserved its elapsed-day schedule after promotion; clarified rate locking and year-one endpoint behavior. |
| Invalid inputs | Original silently clamps/truncates values and permits several invalid cases. Replaced with explicit errors and suspended results. Malformed shared links show a recovery warning. |
| Zero principal | Original shows 0% return and break-even, which are undefined. Now shown as N/A, with zero-day annualization also excluded. |
| Chart | Original downsampling can skip maturity jumps and connects sampled points across unearned interest. Replaced with daily FX points and exact before/after points at each maturity. |
| CSV | Original exports only net interest and balance. Now includes assumptions, eligible principal, gross, tax, net, FX, and exit/unpaid-day data. |
| URL sharing | Original omits default-valued assumptions. New links include all inputs to remain reproducible if illustrative defaults change later. Legacy links remain supported. |

## Reference case

For principal P = 1,000,000 TL, gross annual rate r = 0.36, term n = 32, and withholding t = 0.175:

- Gross = P × r × n / 365 = 31,561.643835616436 TL.
- Tax = gross × t = 5,523.287671232876 TL.
- Net = gross × (1 − t) = **26,038.35616438356 TL**, displayed as **26,038.36 TL**.
- Next term's principal = 1,026,038.3561643836 TL.

## Policies that matter

1. No rounding of each term's financial postings. Floating-point precision is retained; formatting is applied at display and CSV export. Bank-specific cent rounding can produce differences.
2. The 365 denominator is intentional, including in leap years; this is an elapsed-day model without calendar dates.
3. Renewal occurs immediately on term boundaries; holiday schedules and renewal gaps are not modeled.
4. No interest is paid on incomplete terms, and no extra penalty is deducted. Bank-specific early-withdrawal contracts can differ.
5. Promotion exclusion is a constant cash portion of the total TRY balance, capped implicitly by `max(0, balance − exclusion)`. It becomes eligible when the promotion ends.
6. Normal rate transition is a linear path over elapsed days, sampled only at renewal. Its clock continues through promotional terms. Both falling and rising rate paths are allowed.
7. The same constant withholding percentage applies to all maturities; the user must supply the applicable assumption.
8. A positive annual USD/TRY increase describes growth in TRY per USD, not an equal percentage decline in the inverse currency value. At +20% USD/TRY, TRY/USD falls by 1 − 1/1.2 ≈ 16.67% over 365 days.
9. Bank buy/sell quotes represent both conversion spreads. The exit quote scales geometrically, assuming a constant proportional spread.
10. USD return for TRY-start scenarios is relative to the TRY capital's immediately convertible USD value. Break-even solves the same benchmark equality, annualized geometrically; negative break-even means lira appreciation is required.

## Tax context

The Turkish Revenue Administration's [2026 temporary Article 67 guide](https://cdn.gib.gov.tr/api/gibportal-file/file/getFile?objectKey=DUYURU%2FUNIVERSAL%2F2026%2F2026_Gecici67.pdf) describes the 17.5% short-term rate associated with the July 2025 change. This is contextual support for the requested example, not a claim that it is universally applicable or automatically current for every user's account. The public app therefore labels it an editable assumption and asks users to confirm their applicable rate.

## Test coverage

The financial suite covers the reference example, term boundaries, after-tax compounding, zero/100% tax, zero capital, zero-day horizons, leap-length horizons, FX geometry and spread directions, early withdrawal, promotion thresholds/expiry, locked renewal rates, ledger reconciliation, chart event sampling, malformed input, URL round trips, CSV exit data, ten-year limits, and an independent fixed-rate closed-form cross-check.

The browser suite covers the displayed reference case, input errors, early exit, promotions/renewals, comparison selection, presets, share/restore/reset, clipboard failure, real CSV downloads, malformed URL safety, zero values, screenshots, and overflow down to 320px. It runs on desktop Chromium, mobile Chromium, and mobile WebKit.
