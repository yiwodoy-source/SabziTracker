# SabziTracker Architecture and Flow

This document explains how the current SabziTracker app is structured, how data moves through it, and where tests and operational checks fit.

## Repository Structure

| Path | Purpose |
| --- | --- |
| `SabziTracker_Production.html` | Main production app. Contains HTML, CSS, JavaScript, runtime checks, and browser-only persistence. |
| `SabziTracker_Test.html` | Test/reference HTML copy. |
| `package.json` | Test runner scripts and JavaScript test dependencies. |
| `playwright.config.js` | Browser test configuration for integration and E2E coverage. |
| `tests/integration/app.spec.js` | Page-level browser checks for navigation, dashboard, log, trends, scanner, suppliers, monthly, spending, export, and health panel. |
| `tests/e2e/journeys.spec.js` | End-to-end browser journeys across common user workflows. |
| `tests/unit/logic.test.js` | Unit test entry point. It loads the root logic regression tests. |
| `regression-matrix.js` and `tests/regression-matrix.js` | Standalone logic regression matrix. |
| `.github/workflows/ci.yml` | GitHub Actions workflow for automated checks. |
| `MONITORING_RUNBOOK.md` | Operational guidance for troubleshooting production usage. |

## Runtime Model

SabziTracker is a local-first browser app. It does not use a backend server or hosted database.

Primary runtime state:

| Variable | Meaning |
| --- | --- |
| `DB` | Full purchase dataset loaded from `localStorage.sabzi_db`. |
| `charts` | Active Chart.js instances, keyed by canvas id. |
| `editingId` | Current row being edited in the purchase modal. |
| `currentPage` | Active page id used by navigation and health logging. |
| `scanRows` | Temporary invoice-entry rows before they are saved into `DB`. |

Primary stored record shape:

```js
{
  id: string,
  date: "DD-MM-YYYY",
  supplier: string,
  invoice_no: string,
  item: string,
  item_orig: string,
  category: "Vegetable" | "Grocery/Dry" | "Dairy" | "Fruit" | "Spice",
  unit: string,
  qty: number,
  rate: number,
  amount: number
}
```

Persistence:

| Storage key | Purpose |
| --- | --- |
| `sabzi_db` | Main purchase records. |
| `sabzi_errors` | Last 50 runtime errors captured by the health monitor. |
| `sabzi_test_results` | Last in-browser regression result summary. |
| `sabzi_deploy_checks` | Last startup environment/deployment check summary. |

## User Flow

1. The app loads `DB` from `localStorage.sabzi_db`.
2. `go('dashboard')` renders the dashboard as the default page.
3. A user can add data through manual entry, scanner quick-entry, demo data, or Excel import.
4. Every save calls `saveDB()`, which writes the full `DB` array back to `localStorage`.
5. Reporting pages render directly from `DB` or from a filtered subset of `DB`.
6. Excel export builds a workbook from the current stored records.

## Scanner Flow

1. User opens the scanner page.
2. User loads an invoice image or PDF.
3. The invoice preview appears and the quick-entry panel opens.
4. User enters invoice date, supplier, invoice number, item, category, unit, qty, and rate.
5. Amount is auto-calculated as `qty * rate`.
6. `addAllToLog()` validates rows and appends valid records to `DB`.
7. `saveDB()` persists the records and dashboard/report pages read them immediately.

The scanner does not perform OCR. It is a fast manual entry surface beside an invoice preview.

## Dashboard Flow

The dashboard month selector controls all dashboard metrics and charts.

When a month is selected:

1. `renderDashboard()` builds `data` from rows where `getMonthKey(row.date)` equals the selected month.
2. Total spend, unique item count, invoice count, category chart, top-item trend chart, rising-price count, and recent purchases all use that same filtered `data`.
3. Invoice count is derived from unique `date + supplier + invoice_no` groups in the selected rows.

When `All Time` is selected, the same calculations run across all dated rows.

## Analytics Flow

Important helpers:

| Function | Purpose |
| --- | --- |
| `parseDateSort(date)` | Converts `DD-MM-YYYY` into sortable `YYYY-MM-DD` text. |
| `getMonthKey(date)` | Converts `DD-MM-YYYY` into `MM-YYYY`. |
| `countInvoices(rows)` | Counts unique invoice groups from the supplied row set. |
| `getItemTrends(rows)` | Computes first/latest rate, average rate, lowest rate, total qty, total spend, and trend label per item. |
| `trendLabel(pct)` | Maps percentage movement to a UI label and CSS class. |

Page-specific rendering:

| Page | Renderer | Data source |
| --- | --- | --- |
| Dashboard | `renderDashboard()` | Selected month rows or all dated rows. |
| Purchase Log | `renderLog()` | Full `DB`, filtered by search/category/supplier/date controls. |
| Trends | `renderTrends()` | Full valid `DB`. |
| Suppliers | `renderSuppliers()` | Full valid `DB`. |
| Monthly | `renderMonthly()` | Selected month rows or all dated rows. |
| Spending | `renderSpending()` | Full valid `DB`. |

## Import and Export Flow

Excel export:

1. `exportExcel()` creates a workbook with five sheets.
2. Sheets include purchase log, item price summary, period comparison, monthly spend report, and spending summary.
3. The workbook downloads as `SabziTracker_YYYY-MM-DD.xlsx`.

Excel import:

1. `importExcel()` reads the first sheet.
2. It finds the header row in the first few rows.
3. It expects columns in the exported purchase-log order.
4. Dates are accepted as `DD-MM-YYYY`, Excel serial dates, or slash dates interpreted as `DD/MM/YYYY`.
5. Rows missing valid date, item, qty, or rate are skipped.
6. Duplicate rows with the same date, supplier, item, qty, and rate are skipped.
7. Valid rows are appended to `DB` and persisted.

## Test Flow

Test command:

```bash
npm test
```

Browser test command:

```bash
npx.cmd playwright test
```

The Playwright tests should use current production ids, not old ids. Important stable ids include:

| Control | Current id |
| --- | --- |
| Add entry button | `btn-add` |
| Save entry button | `btn-save` |
| Export button | `btn-export` |
| Purchase log search | `f-search` |
| Purchase log date filter | `f-date` |
| Trend item selector | `trend-item-sel` |
| Trend chart canvas | `chart-item` |
| Scanner save-all button | `add-all-btn` |
| Manual supplier field | `m-sup` |

## Operational Flow

Runtime hardening is embedded at the bottom of `SabziTracker_Production.html`.

| Layer | Purpose |
| --- | --- |
| Regression harness | Runs pure-function checks on page load and stores results. |
| Trend memoization | Caches all-time trend calculation until data changes. |
| Log debounce | Avoids rendering the purchase log on every keystroke. |
| Storage guard | Warns when browser storage is close to capacity. |
| XSS guard | Sanitizes risky nodes and attributes after render. |
| Error monitoring | Captures browser errors in `sabzi_errors`. |
| Health panel | Opens with `Ctrl + Shift + H` and shows DB, checks, errors, and backup controls. |
| Deployment checks | Confirms CDN libraries, storage, fonts, DOM ids, and recent regression status. |

## Change Rules

Use these rules when editing the app:

1. Keep stored row shape backward compatible unless a migration is added.
2. Any dashboard metric affected by the month selector should use the same filtered row set.
3. Any new user-facing control used in tests should get a stable id.
4. Update Playwright selectors in the same change when HTML ids change.
5. Keep Excel import/export column order documented and tested.
