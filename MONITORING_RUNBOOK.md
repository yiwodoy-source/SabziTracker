# SabziTracker — Production Monitoring & Incident Response Runbook

**Version:** 1.0  
**App:** SabziTracker_Production.html  
**Architecture:** Single-file browser SPA · localStorage persistence · No backend

---

## Quick Reference

| Symptom | First Action | Section |
|---------|-------------|---------|
| Blank page / app won't load | Check CDN scripts loaded | §1 |
| Data missing after reload | Check localStorage | §2 |
| Charts not showing | Check empty state vs error | §3 |
| Export broken | Check DB length, XLSX lib | §4 |
| Import fails silently | Check column order | §5 |
| App slow with large dataset | Run storage diagnostic | §6 |
| Regression test failures | Check health panel | §7 |
| "Storage nearly full" toast | Export and archive | §8 |

---

## §1 — App Blank / Won't Load

**Symptoms:** White screen, or spinner that never stops.

**Step 1 — Open DevTools console (F12)**
```
Look for any red error messages. Common culprits:
  • "Failed to load resource" → CDN script blocked
  • "Chart is not defined" → Chart.js didn't load
  • "XLSX is not defined" → xlsx.js didn't load
```

**Step 2 — Check Network tab**
```
Filter by "JS" — look for failed requests (red) to:
  cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js
  cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
  fonts.googleapis.com (non-critical)
```

**Step 3a — CDN blocked (corporate network / firewall)**
```
Resolution: Host scripts locally.
  1. Download both files from cdnjs.cloudflare.com
  2. Place them alongside the HTML:
       sabzitracker/
         SabziTracker_Production.html
         chart.umd.min.js
         xlsx.full.min.js
  3. In the HTML, change the two <script src="https://..."> tags to:
       <script src="chart.umd.min.js"></script>
       <script src="xlsx.full.min.js"></script>
  Note: This is the ONLY permitted change to the HTML structure.
        It does not alter any logic.
```

**Step 3b — HTTPS required for camera (file:// protocol)**
```
Symptom: App loads but camera button does nothing.
Resolution: Serve via HTTPS.
  Option A: python3 -m http.server 8080  (then open http://localhost:8080)
  Option B: Deploy to Netlify Drop (netlify.com/drop) — free, instant HTTPS
  Option C: Deploy to GitHub Pages
```

**Step 4 — Check health panel**
```
Press Ctrl+Shift+H
Look at "Active Charts" row — should be > 0 after loading demo data.
Look at "Errors logged" row — click "Export Error Log" to get details.
```

---

## §2 — Data Missing After Page Reload

**Symptoms:** DB was populated, now shows empty state after closing/reopening browser.

**Step 1 — Check localStorage directly**
```javascript
// Paste in DevTools console:
const raw = localStorage.getItem('sabzi_db');
console.log('Key exists:', raw !== null);
console.log('Content length:', raw ? raw.length : 0);
console.log('Row count:', raw ? JSON.parse(raw).length : 0);
```

**Step 2 — Identify cause**

| What you see | Cause | Resolution |
|-------------|-------|-----------|
| `Key exists: false` | "Clear All Data" was used | Restore from last Excel export |
| `Row count: 0` | Cleared manually or confirmClear() bug | Restore from export |
| `JSON parse error` | Corrupted localStorage | See §2 Step 3 |
| Row count correct but UI shows empty | Rendering bug | Hard refresh (Ctrl+Shift+R) |

**Step 3 — Corrupted localStorage recovery**
```javascript
// In DevTools console — manually repair:
try {
  const data = localStorage.getItem('sabzi_db');
  JSON.parse(data);
  console.log('JSON is valid — not corrupted');
} catch(e) {
  console.log('CORRUPTED. Clearing key...');
  localStorage.removeItem('sabzi_db');
  console.log('Cleared. Reload the page. Data lost — restore from Excel export.');
}
```

**Prevention:**  
✅ Export Excel every week — use the "⬇ Export Excel" button.  
✅ Each export is a full backup of all 5 sheets.  
✅ Use "Import Excel" to restore from any prior export.

---

## §3 — Charts Not Rendering

**Symptoms:** Chart area is blank, shows "No data yet" placeholder, or canvas is invisible.

**Diagnostic:**
```javascript
// DevTools console:
console.log('Charts object:', Object.keys(charts));
console.log('DB rows:', DB.length);
console.log('Chart.js loaded:', typeof Chart);
```

**Case A — "No data yet" placeholder shown**
```
This is correct behaviour when DB is empty.
Action: Load demo data (🎯 Load Demo Data in sidebar) or scan an invoice.
```

**Case B — DB has rows but chart is blank**
```javascript
// Force re-render:
Object.keys(charts).forEach(k => { try { charts[k].destroy(); } catch(e) {} });
charts = {};
renderDashboard();
```

**Case C — Canvas element hidden (display:none)**
```javascript
// Check and fix:
['chart-cat','chart-trend','chart-item','chart-sc','chart-ss'].forEach(id => {
  const el = document.getElementById(id);
  if (el && el.style.display === 'none') {
    el.style.display = '';
    // Also remove the "No data yet" placeholder if present
    const ph = el.parentElement.querySelector('.chart-empty');
    if (ph) ph.remove();
  }
});
renderDashboard();
```

**Case D — Chart.js not loaded**
```
typeof Chart === 'undefined' in console.
Resolution: See §1 CDN blocked. Chart.js must be loaded before the app script.
```

---

## §4 — Export Excel Fails

**Symptoms:** No file downloads, or "No data to export" toast, or JS error.

**Step 1:**
```javascript
console.log('DB length:', DB.length);  // Must be > 0
console.log('XLSX loaded:', typeof XLSX !== 'undefined');
```

**Step 2 — DB empty:**
```
Load data first. Use Load Demo Data to test.
```

**Step 3 — XLSX not loaded:**
```
See §1. xlsx.js CDN must be loaded. Without it, exportExcel() will throw
"XLSX is not defined".
```

**Step 4 — File downloads but won't open in Excel:**
```
Ensure file extension is .xlsx (not .xls or .xlsx.txt).
Excel on Windows sometimes renames downloads — check the filename.
```

**Step 5 — Verify sheet count:**
```javascript
// After export, re-import and check:
// The exported file must always have exactly 5 sheets:
// 1. Purchase Log
// 2. Item Price Summary
// 3. Period Comparison
// 4. Monthly Spend Report
// 5. Spending Summary
```

---

## §5 — Import Excel Fails or Produces Duplicates

**Symptoms:** "Import failed" toast, 0 rows added, or rows added with wrong values.

**Expected column order (Purchase Log sheet, zero-indexed):**
```
Col 0: Date (DD-MM-YYYY)
Col 1: Supplier
Col 2: Invoice No
Col 3: Item (English)
Col 4: Item (Original)
Col 5: Category
Col 6: Unit
Col 7: Qty
Col 8: Rate ₹
Col 9: Amount ₹
```

**Step 1 — Wrong file type:**
```
Only import files exported by SabziTracker_Production.html.
The "Purchase Log" sheet must be the FIRST sheet in the workbook.
```

**Step 2 — Duplicate import:**
```
Importing the same file twice is safe — the dupe detector checks
date + supplier + item + qty + rate. Exact duplicates are skipped.
Toast shows: "Imported N rows · M duplicates skipped"
```

**Step 3 — 0 rows imported:**
```javascript
// Check header detection:
// importExcel() scans the first 3 rows for a row containing "item" or "date"
// and starts reading from the row after that.
// If your file has extra header rows, it may start reading from the wrong row.
```

**Step 4 — Corrupt import (wrong values in wrong fields):**
```
The column order must exactly match the export format.
Do NOT reorder columns in Excel before re-importing.
If you modified the exported file, column positions may have shifted.
```

---

## §6 — App Slow with Large Dataset

**Threshold:** Performance degrades noticeably above ~2,000 rows.

**Step 1 — Check actual size:**
```javascript
// DevTools console:
const used = new Blob([localStorage.getItem('sabzi_db')||'']).size;
console.log(`DB: ${DB.length} rows, ${Math.round(used/1024)}KB`);
// Limit: ~5,000KB total localStorage
// At ~300 bytes/row: 5000KB ÷ 0.3KB = ~16,000 rows max
```

**Step 2 — Archive old data:**
```
Monthly archive workflow:
  1. Export Excel → save as "SabziTracker_2026_March.xlsx"
  2. Go to Spending Summary → note total for the month
  3. Use filter in Purchase Log → filter to current month only
  4. Export current month only as "SabziTracker_2026_April_current.xlsx"
  5. Click "Clear All Data" (confirm)
  6. Import "SabziTracker_2026_April_current.xlsx" (current month only)
  7. Keep older monthly files as offline archive
```

**Step 3 — Identify slow operations:**
```javascript
// In DevTools Performance tab:
// Record 10 seconds while navigating all pages.
// Look for functions taking >16ms:
//   getItemTrends() — now memoized, should be fast after first call
//   renderLog() — now debounced to 180ms, shouldn't block UI
//   renderSupplierTable() — O(items × suppliers), slow above 50 items × 10 suppliers
```

---

## §7 — Regression Test Failures

**How to check:**
```
Press Ctrl+Shift+H → look at "Tests" row.
Green number = passed. Red number = failed.
```

**What a regression failure means:**
```
One of the core pure functions (parseDateSort, trendLabel, getItemTrends, etc.)
is returning a different result than expected.

This means either:
  A) The production HTML was modified and a logic function changed behaviour
  B) The test expectations are wrong (unlikely — they document exact boundaries)
  C) A browser extension is interfering with the app
```

**Step 1 — Run standalone matrix:**
```bash
node tests/regression-matrix.js
# Exit 0 = all pass
# Exit 1 = failures with details
```

**Step 2 — Identify which test failed:**
```
Health panel shows "Last Error" with the test label.
Alternatively: DevTools console shows "[SabziTracker] Regression failures: [...]"
```

**Step 3 — Compare with v5:**
```bash
# Check if the original logic block is intact:
python3 -c "
with open('SabziTracker_v5.html') as f: v5=f.read()
with open('SabziTracker_Production.html') as f: pr=f.read()
v5_end = v5.find('// ═══════════════════════════════════════════════════════════\n// INIT')
pr_end = pr.find('// PHASE 1')
print('Logic blocks identical:', v5[:v5_end].rstrip() == pr[:pr_end].rstrip().rsplit('\n',1)[0].rstrip())
"
```

**Step 4 — If blocks differ:**
```
Roll back to SabziTracker_v5.html and re-apply Phase 1–4 additions only.
The Phase 1–4 blocks must be injected strictly before the INIT section.
Zero lines of the original logic may be modified.
```

---

## §8 — Storage Nearly Full Warning

**Toast:** "Storage nearly full (NNKB / ~5MB). Export Excel to archive."

**Immediate action:**
```
1. Click "⬇ Export Excel" in the header — saves all data
2. Verify the download succeeded (check file size > 10KB)
3. Open the file in Excel to confirm data is present
```

**Follow-up:**
```
4. Decide: archive old months or increase dataset (not possible — 5MB is a browser limit)
5. If archiving: follow §6 Step 2 monthly archive workflow
6. If you need more than ~15,000 rows: the app needs a backend database
   (out of scope for this version — file a feature request)
```

**Check remaining headroom:**
```javascript
// DevTools console:
const total = new Blob([JSON.stringify(localStorage)]).size;
const db    = new Blob([localStorage.getItem('sabzi_db')||'']).size;
console.log(`localStorage: ${Math.round(db/1024)}KB used (DB) + ${Math.round((total-db)/1024)}KB other`);
console.log(`Remaining: ~${Math.round((5000-total/1024))}KB`);
```

---

## §9 — Health Panel Reference

**Open:** `Ctrl+Shift+H` in any browser  
**Close:** Press again, or click ×

| Field | What it tells you |
|-------|------------------|
| DB Rows | Total purchase entries |
| DB Size | localStorage usage vs 5MB limit — green < 2MB, amber < 4MB, red > 4MB |
| Total Storage | All localStorage keys combined |
| Unique Items | Distinct item names |
| Suppliers | Distinct supplier names |
| Purchase Dates | Distinct purchase dates |
| Total Spend | Sum of all Amount values |
| Invoices (session) | Invoices scanned this browser session |
| Active Charts | Chart.js instances currently alive (0 = charts not rendered yet) |
| Tests | Built-in regression results: `Npassed ✓ 0✗ of N` is ideal |
| Last Test | When regression ran (on every page load) |
| Errors logged | Count of JS errors caught since last clear |
| Last Error | Timestamp + message of most recent error |
| Browser | Browser engine and version |
| Online | Whether browser reports network connectivity |

**Export Error Log button:**  
Downloads `sabzi_errors.json` — share with developer when reporting bugs.

**Export Backup button:**  
Same as clicking "⬇ Export Excel" — triggers immediate Excel download.

---

## §10 — Error Log Interpretation

**Access:**
```javascript
// DevTools console:
JSON.parse(localStorage.getItem('sabzi_errors')||'[]')
  .forEach((e,i) => console.log(`[${i}] ${e.ts} page=${e.page} dbRows=${e.dbRows} msg=${e.msg}`));
```

**Common error patterns:**

| Error message | Likely cause | Action |
|--------------|-------------|--------|
| `REGRESSION FAIL: R0N ...` | Logic function changed behaviour | See §7 |
| `saveDB FAILED: QuotaExceededError` | localStorage full | See §8 |
| `Cannot read properties of undefined` | DOM element missing | Hard refresh |
| `UnhandledPromise: ...` | Async operation failed | Check console for details |
| `Chart.js is not defined` | CDN failed to load | See §1 |
| `XLSX is not defined` | CDN failed to load | See §1 |

**Clear error log:**
```javascript
localStorage.removeItem('sabzi_errors');
// Or: Open health panel → click "Clear Error Log" button
```

---

## Deployment Checklist

Run before every production deployment:

```bash
# 1. Run regression matrix (must be 96/96)
node tests/regression-matrix.js

# 2. Verify file integrity
python3 -c "
with open('SabziTracker_Production.html') as f: h=f.read()
fns=['parseDateSort','getItemTrends','validateDate','trendLabel','catClass',
     'saveDB','exportExcel','importExcel','renderLog','esc']
missing=[f for f in fns if f'function {f}(' not in h]
phases=[f'PHASE {n}' for n in ['1','2A','2B','2C','2D','3A','3B','4','4B']]
mp=[p for p in phases if p not in h]
print('Functions missing:', missing or 'None')
print('Phases missing:', mp or 'None')
print('File size:', round(len(h)/1024), 'KB')
"

# 3. Open in Chrome → Ctrl+Shift+H → confirm Tests row shows 0 failures
# 4. Click Load Demo Data → navigate all 7 pages → no console errors
# 5. Export Excel → verify 5 sheets present → import back → 0 duplicates
# 6. Clear data → reload → confirm DB = 0 rows
# 7. Deploy
```

---

*Runbook version 1.0 — SabziTracker_Production.html — Phase 1–4 hardening*
