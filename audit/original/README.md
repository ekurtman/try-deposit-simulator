# TRY Deposit Simulator

A static, mobile-friendly, single-file website for modeling Turkish lira term deposits in USD.

## Deploy to Vercel
1. Download and unzip this project.
2. Add these files to a GitHub repository (root directory).
3. In Vercel, choose **Add New → Project**, import the GitHub repository.
4. Framework preset: **Other**. Build command: leave empty. Output directory: leave as default (`.`).
5. Deploy. Vercel will assign a public `.vercel.app` URL.

Alternative: use the Vercel CLI: `npx vercel --prod` in this directory.

## Calculation
- First conversion: `starting TRY = starting USD × bank's USD buying quote`.
- Each **completed** deposit term: `gross interest = eligible TRY × (annual rate / 100) × (term days / 365)`; deduct withholding and compound the net amount.
- No interest for unfinished term at an early-exit date.
- FX depreciation: `future USD selling rate = initial bank USD selling rate × (1 + annual USD/TRY increase / 100)^(elapsed days / 365)`.
- End value: `final TRY / future USD selling rate`.
- Scenario share button generates URL query parameters; no data leaves the browser.

The displayed rates and quotes are editable illustrative starting values, not live quotes. This is an educational model, not financial advice.
