# Foreign Asset Workbench

Browser-only Schedule FA Table A3, Schedule FSI, and Schedule TR preparation for Fidelity Microsoft equity statements. Uploaded files and taxpayer inputs remain in browser memory and are never sent to a server.

## Supported evidence

- Open lots CSV: `Date acquired`, `Quantity`, `Cost basis`; `Share source` must be present for discounted `SP` lots.
- Sold lots CSV: `Date acquired`, `Date sold`, `Quantity`, `Cost basis`, `Proceeds`.
- Dividend tax CSV: `Payment date`, `Gross dividend`, `Tax withheld`.
- Manual acquisitions, sales, and withholding corrections are available in the evidence rail.

Header aliases used by common Fidelity exports are accepted. Templates are under `public/templates/`.

## Calculation model

- Schedule FA covers the calendar year ending 31 December 2025.
- Initial value uses USD cost basis multiplied by the SBI TT rate on the acquisition date, falling back up to five prior days. For `SP` lots, the 10% purchase discount is reversed (`cost basis / 0.90`) to recover acquisition-date fair market value.
- Peak value searches each daily Microsoft price and dated SBI TT rate while the lot is held.
- Closing value uses the reference pack's 31 December price and SBI TT rate.
- Gross credited uses eligible shares on each dividend record date, Microsoft dividend per share, and the SBI TT rate at the prior month end.
- Schedule FSI/TR foreign income covers FY 2025-26, including the January-March 2026 dividend.
- Actual withholding evidence overrides the clearly labeled 25% estimate.
- Schedule TR relief is the lower of foreign tax paid and attributable Indian tax.

The versioned reference data is in `src/data/ay-2026-27.json`. Its provenance is shown in the application and must be independently checked against primary sources before filing.

## Develop

```bash
npm ci
npm run dev
```

Open `http://localhost:5173/`.

## Validate

```bash
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

On minimal Linux environments, Playwright may also require its documented Chromium system dependencies.

## Deploy

```bash
npm ci
npm run build
```

Deploy the generated `dist/` directory to any static host. No API, database, environment variable, authentication provider, or server-side runtime is required.

## Filing caution

The workbench prepares calculation drafts; it does not submit an ITR. Do not treat zero sales or estimated withholding as filing evidence. Reconcile exports with Fidelity statements, Form 1042-S/withholding records, Form 67, and a qualified tax professional.
