# SabziTracker — Production Test Suite

Complete testing and hardening infrastructure for `SabziTracker_Production.html`.

Detailed implementation structure and data flow are documented in
[`docs/ARCHITECTURE_FLOW.md`](docs/ARCHITECTURE_FLOW.md).

---

## File Structure

```
SabziTracker_Production.html     ← The production application
SabziTracker_Production_Blueprint.md  ← Strategic blueprint document
tests/
  regression-matrix.js           ← Standalone 96-check runner (no npm needed)
  pre-commit                      ← Git pre-commit hook
  package.json                    ← npm config for Jest + Playwright
  playwright.config.js            ← Playwright browser test config
  global-setup.js                 ← Test suite bootstrap
  global-teardown.js              ← Test suite summary generator
  MONITORING_RUNBOOK.md           ← Incident response procedures
  unit/
    logic.test.js                 ← Jest unit tests (pure function logic)
  integration/
    app.spec.js                   ← Playwright DOM + workflow tests
  e2e/
    journeys.spec.js              ← Playwright full user journey tests
  .github/workflows/
    ci.yml                        ← GitHub Actions CI/CD pipeline
```

---

## Quick Start — No npm Required

The regression matrix runs as a standalone Node.js script:

```bash
# Requires: Node.js v18+ (no npm install needed)
node tests/regression-matrix.js
```

Expected output:
```
SabziTracker — Regression Matrix
────────────────────────────────────────────────────────
Running (. pass, F fail): ................................................................................................

────────────────────────────────────────────────────────
  Total: 96   Passed: 96 ✓   Failed: 0
────────────────────────────────────────────────────────

  All 96 checks passed ✓  Safe to deploy.
```

Exit code 0 = all pass. Exit code 1 = failures with details.

---

## Full Test Suite Setup

```bash
# Install dependencies (one time)
cd tests
npm install

# Run unit tests only (fast, ~3 seconds)
npm test

# Run unit tests with coverage report
npm run test:unit

# Install Playwright browsers (one time)
npx playwright install chromium

# Run integration tests (requires Chromium)
npm run test:integration

# Run E2E journey tests
npm run test:e2e

# Run everything
npm run test:all
```

---

## Install Pre-Commit Hook

```bash
# From the repo root:
cp tests/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

After this, every `git commit` that touches `SabziTracker_Production.html`
automatically runs the regression matrix. The commit is blocked if any check fails.

To skip in an emergency:
```bash
git commit --no-verify -m "emergency fix"
```

---

## CI/CD (GitHub Actions)

Copy `.github/workflows/ci.yml` to your repository root:

```bash
mkdir -p .github/workflows
cp tests/.github/workflows/ci.yml .github/workflows/
```

The pipeline runs automatically on every push to `main` or `develop` when
`SabziTracker_Production.html` or any test file changes. It runs 7 jobs in sequence:

1. **Integrity** — HTML structure, required functions, file size
2. **Regression** — 96-check standalone matrix
3. **Unit Tests** — Jest pure function tests with coverage
4. **Integration** — Playwright DOM and filter tests
5. **E2E** — Playwright full user journey tests
6. **Security** — XSS guard, SRI, no hardcoded secrets
7. **Performance** — Memoization, debounce, storage guard, file size budget

All 7 must pass for the pipeline to succeed.

---

## Production Health Panel

Open in any browser while using the app:

**`Ctrl + Shift + H`**

Shows live DB stats, test results, error log, storage usage, and a backup button.
See `MONITORING_RUNBOOK.md` for full field reference and incident procedures.

---

## What Each Phase Added (additive only — zero logic changes)

| Phase | What | Where |
|-------|------|-------|
| 1 | 45-assertion regression harness, runs on every page load | Injected before INIT |
| 2A | `getItemTrends` memoization wrapper | Wraps existing function |
| 2B | `renderLog` 180ms debounce | Wraps existing function |
| 2C | localStorage quota warning at 4MB | Wraps saveDB |
| 2D | XSS guard: `esc()` utility + DOM MutationObserver | Additive |
| 3A | Global error handler → `sabzi_errors` localStorage | Additive |
| 3B | Health panel at Ctrl+Shift+H | Additive |
| 4 | Startup deployment checks (500ms after load) | Additive |
| 4B | saveDB failure guard for QuotaExceededError | Wraps saveDB |

**Constraint:** The original 90,820 characters of application logic are
byte-for-byte identical between `SabziTracker_v5.html` and `SabziTracker_Production.html`.
No function body, variable name, or business rule was modified.

---

## Regression Checks Covered (96 total)

| Group | Count | Functions Tested |
|-------|-------|-----------------|
| R01 parseDateSort | 7 | Date format conversion, sort correctness, edge cases |
| R02 getMonthKey | 8 | MM-YYYY extraction, format validation |
| R03 trendLabel | 17 | All 5 labels, all 5 CSS classes, exact boundaries |
| R04 validateDate | 13 | Valid/invalid formats, ranges, edge cases |
| R05 catClass | 9 | All categories, case-sensitivity, null handling |
| R06 uid | 4 | Type, uniqueness ×2000, character set |
| R07 getItemTrends | 16 | Multi-entry, sort order, totals, empty DB, coercion |
| R08 Month filter | 2 | Pipeline correctness, format match |
| R09 saveDB | 6 | Persistence, overwrite, JSON validity |
| R10 calcAmount | 4 | Arithmetic, zero guard |
| R11 esc() | 9 | All special chars, null, number, XSS payload |
| R12 Sort correctness | 2 | Array sort via parseDateSort |

---

## Incident Response

See `MONITORING_RUNBOOK.md` for:
- App won't load (CDN blocked, HTTPS required)
- Data missing after reload (localStorage recovery)
- Charts not rendering (empty state vs error)
- Export/import failures (column mapping, duplicates)
- App slow with large dataset (archive workflow)
- Regression test failures (logic integrity check)
- Storage nearly full (archive procedure)
