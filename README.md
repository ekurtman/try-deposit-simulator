# TRY Deposit Simulator

A responsive, dependency-free static calculator for hypothetical Turkish lira deposits and their USD liquidation value. All default rates and FX quotes are illustrative, not live banking data or forecasts.

## Run locally

Requires Node.js 22 or later.

```sh
npm ci --ignore-scripts
npm run dev
```

Open http://127.0.0.1:4173.

```sh
npm test                            # financial model, edge cases, URL/CSV regression tests
npx playwright install chromium webkit
npm run test:browser                # desktop Chrome, Android-sized Chrome, iPhone-sized WebKit
npm run build                      # financial tests must pass before dist is created
```

For the browser suite against a deployed site:

```sh
BASE_URL=https://your-project.vercel.app npm run test:browser
```

## Financial model

- USD entry: starting TRY = USD capital × bank USD **buying** quote.
- TRY entry: deposit capital directly; starting USD benchmark = TRY / initial bank USD **selling** quote.
- Gross interest per completed term = eligible principal × annual gross rate / 100 × actual term days / 365.
- Withholding = gross interest × tax / 100. Only net interest compounds, and only on maturity.
- Exit before maturity earns **zero** interest for the unfinished term; earlier credited interest remains. No separate penalty is assumed.
- Exit selling quote = initial selling quote × (1 + annual USD/TRY increase / 100)^(elapsed days / 365).
- Final USD = final TRY / exit selling quote. Quoted bid/ask prices already incorporate spreads; no spread is deducted twice.
- Optional rates change linearly over the first 365 elapsed days, sampled at each term's start and locked to maturity.
- A hypothetical promo overrides the rate for the first N terms. The excluded TRY amount earns no interest during those terms; afterwards the full balance is eligible. Normal renewal rates resume on the elapsed-day schedule.
- Full floating-point precision is retained between maturities. Monetary amounts are formatted to two decimals for display/export. A bank that rounds every interest/tax posting may differ by small amounts.

Required check:

```text
1,000,000 × 0.36 × 32 / 365 = 31,561.643835616436 TL gross
Withholding (17.5%)         =  5,523.287671232876 TL
Net interest               = 26,038.35616438356 TL → 26,038.36 TL
```

See [audit/CALCULATIONS.md](audit/CALCULATIONS.md) for the source review and assumptions.

## Sharing and export

“Copy scenario link” serializes every assumption into URL parameters. Legacy links from the attached simulator remain supported. Invalid URL values produce a warning and fall back to the corresponding illustrative defaults. Invalid interactive inputs pause results instead of silently changing values.

CSV includes all assumptions, gross interest, withholding, net interest, opening/maturity balances, FX liquidation values, and an explicit exit row. Unpaid days remain visible even when the final term is incomplete.

All calculations run locally. Shared assumptions are visible to anyone with the URL and can appear in browser history and hosting logs. There is no analytics, tracking SDK, third-party font, database, or server-side financial API.

## Deployment

`vercel.json` selects a static architecture, runs `npm run build`, and publishes only `dist/`. That build runs the financial test suite and fails before publication if a test fails. GitHub Actions also runs the full financial and browser suite on pushes to main and pull requests.

```sh
npx vercel --prod
```

Production security headers restrict scripts/assets to this origin, disable framing, and disable camera, microphone, and geolocation. Only the five files in `public/` are copied into the deployed output. Source, tests, and the original attachment remain outside the public site.

## Structure

- `public/model.js` — pure, shared calculation, validation, scenario, chart-series, and CSV functions.
- `public/app.js` — DOM interactions and SVG chart rendering.
- `public/index.html`, `public/styles.css`, `public/favicon.svg` — static UI.
- `tests/` — Node unit/regression tests and Playwright browser tests.
- `audit/original/` — unmodified contents of the supplied archive, retained for comparison only.
- `scripts/` — minimal static build and local development server.

## Limits

This is an educational scenario tool, not financial advice or a bank quotation. Confirm your account's withholding rate and promotion rules. Tax is not automatically inferred from term length or date. The model excludes additional taxes, fees, inflation, default risk, changing proportional FX spreads, tiered balances, holiday/renewal delays, bank-specific rounding, and USD alternative-investment interest. Mobile verification uses browser/device emulation, not physical devices.
