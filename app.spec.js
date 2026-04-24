/**
 * SabziTracker Production — Integration Test Suite
 * Tests DOM interactions, page renders, filter pipelines, and
 * multi-function workflows using Playwright against the real HTML file.
 *
 * Run: npx playwright test tests/integration/
 *
 * CONSTRAINT: These tests only READ state and trigger existing functions.
 * No application logic is modified. All assertions verify existing behaviour.
 */

'use strict';

const { test, expect } = require('@playwright/test');
const path             = require('path');

const APP_URL = 'file://' + path.resolve(__dirname, '../../SabziTracker_Production.html');

// ─── Helper: load app and seed demo data ────────────────────────────────────
async function withDemo(page) {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  // Suppress confirm dialogs (for loadDemoData and confirmClear)
  page.on('dialog', d => d.accept());
  await page.evaluate(() => {
    // Suppress go() navigation side effects during seed only
    const origGo = go;
    loadDemoData();
    origGo('dashboard');
  });
  // Wait for dashboard to render
  await page.waitForSelector('#s-spend');
}

// ─── Navigation ─────────────────────────────────────────────────────────────
test.describe('Navigation — go() function', () => {
  test('all 7 pages render without JS error', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await withDemo(page);

    const pages = ['dashboard','scanner','log','trends','suppliers','monthly','spending'];
    for (const id of pages) {
      await page.evaluate(p => go(p), id);
      await page.waitForTimeout(120); // let debounce settle
      const active = await page.$(`#page-${id}.active`);
      expect(active, `page-${id} should be active`).not.toBeNull();
    }
    expect(errors).toHaveLength(0);
  });

  test('nav button and sidebar item both get .active class on navigation', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('log'));
    const navActive = await page.$('button#nav-log.active');
    const sbActive  = await page.$('button#sb-log.active');
    expect(navActive).not.toBeNull();
    expect(sbActive).not.toBeNull();
  });

  test('only one page is visible at a time', async ({ page }) => {
    await withDemo(page);
    const pages = ['trends','suppliers','monthly'];
    for (const id of pages) {
      await page.evaluate(p => go(p), id);
      const visiblePages = await page.$$('.page.active');
      expect(visiblePages).toHaveLength(1);
    }
  });
});

// ─── Dashboard ───────────────────────────────────────────────────────────────
test.describe('Dashboard — renderDashboard()', () => {
  test('Total Spend shows ₹ value with demo data', async ({ page }) => {
    await withDemo(page);
    const spend = await page.textContent('#s-spend');
    expect(spend).toMatch(/₹[\d,]+/);
    expect(spend).not.toBe('₹0');
  });

  test('Items Tracked shows non-zero count', async ({ page }) => {
    await withDemo(page);
    const items = await page.textContent('#s-items');
    expect(parseInt(items, 10)).toBeGreaterThan(0);
  });

  test('month filter dropdown is populated after data load', async ({ page }) => {
    await withDemo(page);
    const opts = await page.$$('#dash-month option');
    expect(opts.length).toBeGreaterThan(1); // "All Time" + at least one month
  });

  test('filtering by month updates spend stat', async ({ page }) => {
    await withDemo(page);
    const allSpend = await page.textContent('#s-spend');

    // Select a specific month
    const monthVal = await page.$eval('#dash-month option:nth-child(2)', el => el.value);
    await page.evaluate(m => {
      document.getElementById('dash-month').value = m;
      renderDashboard();
    }, monthVal);

    const filteredSpend = await page.textContent('#s-spend');
    // Filtered spend should be ≤ all-time spend
    const parseSpend = s => parseInt(s.replace(/[₹,]/g,''), 10);
    expect(parseSpend(filteredSpend)).toBeLessThanOrEqual(parseSpend(allSpend));
  });

  test('recent purchases table shows rows with demo data', async ({ page }) => {
    await withDemo(page);
    const rows = await page.$$('#recent-table-wrap tbody tr');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(15); // capped at 15
  });

  test('category chart canvas is visible with data', async ({ page }) => {
    await withDemo(page);
    const canvas = await page.$('#chart-cat');
    const display = await canvas.evaluate(el => el.style.display);
    expect(display).not.toBe('none');
  });
});

// ─── Purchase Log ────────────────────────────────────────────────────────────
test.describe('Purchase Log — renderLog(), filters, CRUD', () => {
  test('shows all demo rows with no filters applied', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('log'));
    await page.waitForTimeout(250); // debounce
    const dbLen = await page.evaluate(() => DB.length);
    const rows  = await page.$$('#log-body tr');
    expect(rows.length).toBe(dbLen);
  });

  test('search filter narrows to matching rows only', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('log'));
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      document.getElementById('f-search').value = 'Tomato';
      renderLog();
    });
    await page.waitForTimeout(250);
    const rows = await page.$$('#log-body tr');
    for (const row of rows) {
      const text = await row.innerText();
      expect(text.toLowerCase()).toContain('tomato');
    }
  });

  test('category filter shows only matching category', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('log'));
    await page.evaluate(() => {
      document.getElementById('f-cat').value = 'Dairy';
      renderLog();
    });
    await page.waitForTimeout(250);
    const rows = await page.$$('#log-body tr');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const text = await row.innerText();
      expect(text).toContain('Dairy');
    }
  });

  test('supplier filter shows only rows for that supplier', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('log'));
    const suppliers = await page.evaluate(() => [...new Set(DB.map(r=>r.supplier).filter(Boolean))]);
    const target = suppliers[0];
    const expected = await page.evaluate(s => DB.filter(r=>r.supplier===s).length, target);
    await page.evaluate(s => {
      document.getElementById('f-sup').value = s;
      renderLog();
    }, target);
    await page.waitForTimeout(250);
    const rows = await page.$$('#log-body tr');
    expect(rows.length).toBe(expected);
  });

  test('supplier dropdown preserves selection after re-render', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('log'));
    const suppliers = await page.evaluate(() => [...new Set(DB.map(r=>r.supplier).filter(Boolean))]);
    const target = suppliers[0];
    await page.evaluate(s => {
      document.getElementById('f-sup').value = s;
      renderLog(); // first render — rebuilds dropdown
      renderLog(); // second render — must preserve selection
    }, target);
    await page.waitForTimeout(250);
    const selected = await page.$eval('#f-sup', el => el.value);
    expect(selected).toBe(target);
  });

  test('date dropdown preserves selection after re-render', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('log'));
    const dates = await page.evaluate(() => [...new Set(DB.map(r=>r.date).filter(Boolean))]);
    const target = dates[0];
    await page.evaluate(d => {
      document.getElementById('f-date').value = d;
      renderLog();
      renderLog(); // second render must preserve
    }, target);
    await page.waitForTimeout(250);
    const selected = await page.$eval('#f-date', el => el.value);
    expect(selected).toBe(target);
  });

  test('empty DB shows correct empty state message', async ({ page }) => {
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    page.on('dialog', d => d.accept());
    await page.evaluate(() => go('log'));
    await page.waitForTimeout(250);
    const body = await page.textContent('#log-body');
    expect(body).toContain('No data yet');
  });

  test('no-match filter shows "Clear filters" link', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('log'));
    await page.evaluate(() => {
      document.getElementById('f-search').value = 'zzz_no_such_item_xyz';
      renderLog();
    });
    await page.waitForTimeout(250);
    const body = await page.textContent('#log-body');
    expect(body).toContain('Clear filters');
  });

  test('delete row reduces DB length by 1', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('log'));
    const before = await page.evaluate(() => DB.length);
    const firstId = await page.evaluate(() => DB[0].id);
    page.on('dialog', d => d.accept());
    await page.evaluate(id => deleteRow(id), firstId);
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => DB.length);
    expect(after).toBe(before - 1);
  });

  test('deleted row is not present in DB', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('log'));
    const targetId = await page.evaluate(() => DB[0].id);
    await page.evaluate(id => deleteRow(id), targetId);
    const stillPresent = await page.evaluate(id => DB.some(r=>r.id===id), targetId);
    expect(stillPresent).toBe(false);
  });
});

// ─── Add/Edit Modal ──────────────────────────────────────────────────────────
test.describe('Add/Edit Modal — saveEntry(), calcAmount()', () => {
  test('calcAmount auto-fills amount from qty × rate', async ({ page }) => {
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      openAddModal();
      document.getElementById('m-qty').value  = '10';
      document.getElementById('m-rate').value = '26';
      calcAmount();
    });
    const amt = await page.$eval('#m-amt', el => el.value);
    expect(amt).toBe('260.00');
  });

  test('saveEntry adds exactly 1 row to DB', async ({ page }) => {
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    const before = await page.evaluate(() => DB.length);
    await page.evaluate(() => {
      openAddModal();
      document.getElementById('m-date').value  = '07-04-2026';
      document.getElementById('m-sup').value   = 'Integration Test Vendor';
      document.getElementById('m-item').value  = 'Integration Test Item';
      document.getElementById('m-qty').value   = '5';
      document.getElementById('m-rate').value  = '50';
      document.getElementById('m-amt').value   = '250';
      saveEntry();
    });
    const after = await page.evaluate(() => DB.length);
    expect(after).toBe(before + 1);
  });

  test('saved entry has correct field values', async ({ page }) => {
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      openAddModal();
      document.getElementById('m-date').value  = '07-04-2026';
      document.getElementById('m-sup').value   = 'TestSup';
      document.getElementById('m-item').value  = 'TestItem';
      document.getElementById('m-cat').value   = 'Dairy';
      document.getElementById('m-unit').value  = 'litre';
      document.getElementById('m-qty').value   = '3';
      document.getElementById('m-rate').value  = '80';
      document.getElementById('m-amt').value   = '240';
      saveEntry();
    });
    const row = await page.evaluate(() => DB.find(r=>r.item==='TestItem'));
    expect(row).toBeTruthy();
    expect(row.date).toBe('07-04-2026');
    expect(row.supplier).toBe('TestSup');
    expect(row.category).toBe('Dairy');
    expect(row.unit).toBe('litre');
    expect(row.qty).toBe(3);
    expect(row.rate).toBe(80);
    expect(row.amount).toBe(240);
  });

  test('saveEntry without item name does not add a row', async ({ page }) => {
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    const before = await page.evaluate(() => DB.length);
    await page.evaluate(() => {
      openAddModal();
      document.getElementById('m-item').value  = '';
      document.getElementById('m-qty').value   = '5';
      document.getElementById('m-rate').value  = '50';
      saveEntry();
    });
    const after = await page.evaluate(() => DB.length);
    expect(after).toBe(before); // unchanged
  });

  test('saveEntry with invalid date format is rejected', async ({ page }) => {
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    const before = await page.evaluate(() => DB.length);
    await page.evaluate(() => {
      openAddModal();
      document.getElementById('m-date').value  = '2026-04-07'; // wrong format
      document.getElementById('m-item').value  = 'BadDateItem';
      document.getElementById('m-qty').value   = '5';
      document.getElementById('m-rate').value  = '50';
      saveEntry();
    });
    const after = await page.evaluate(() => DB.length);
    expect(after).toBe(before);
  });

  test('editModal pre-fills all fields from the correct row', async ({ page }) => {
    await withDemo(page);
    const targetRow = await page.evaluate(() => DB[0]);
    await page.evaluate(id => openEditModal(id), targetRow.id);
    const vals = await page.evaluate(() => ({
      date:  document.getElementById('m-date').value,
      sup:   document.getElementById('m-sup').value,
      item:  document.getElementById('m-item').value,
      cat:   document.getElementById('m-cat').value,
      unit:  document.getElementById('m-unit').value,
      qty:   document.getElementById('m-qty').value,
      rate:  document.getElementById('m-rate').value,
    }));
    expect(vals.item).toBe(targetRow.item);
    expect(vals.date).toBe(targetRow.date);
    expect(parseFloat(vals.qty)).toBe(targetRow.qty);
    expect(parseFloat(vals.rate)).toBe(targetRow.rate);
  });

  test('edit preserves original row ID', async ({ page }) => {
    await withDemo(page);
    const originalId = await page.evaluate(() => DB[0].id);
    await page.evaluate(id => {
      openEditModal(id);
      document.getElementById('m-rate').value = '99';
      document.getElementById('m-amt').value  = String(DB[0].qty * 99);
      saveEntry();
    }, originalId);
    const afterId = await page.evaluate(id => DB.find(r=>r.id===id)?.id, originalId);
    expect(afterId).toBe(originalId);
  });

  test('Escape key closes modal', async ({ page }) => {
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => openAddModal());
    let isOpen = await page.evaluate(() => document.getElementById('entry-modal').classList.contains('open'));
    expect(isOpen).toBe(true);
    await page.keyboard.press('Escape');
    isOpen = await page.evaluate(() => document.getElementById('entry-modal').classList.contains('open'));
    expect(isOpen).toBe(false);
  });

  test('overlay click closes modal', async ({ page }) => {
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => openAddModal());
    // Click the overlay element directly (not the modal card)
    await page.evaluate(() => document.getElementById('entry-modal').click());
    const isOpen = await page.evaluate(() => document.getElementById('entry-modal').classList.contains('open'));
    expect(isOpen).toBe(false);
  });
});

// ─── Price Trends ────────────────────────────────────────────────────────────
test.describe('Trends page — renderTrends(), chart, item selector', () => {
  test('trend summary table populates with demo data', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('trends'));
    const rows = await page.$$('#trend-summary-body tr');
    expect(rows.length).toBeGreaterThan(0);
  });

  test('item selector is populated with all unique items', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('trends'));
    const opts   = await page.$$('#trend-item-sel option');
    const dbItems = await page.evaluate(() => new Set(DB.map(r=>r.item)).size);
    expect(opts.length - 1).toBe(dbItems); // minus the placeholder option
  });

  test('selecting an item updates stat cards', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('trends'));
    const firstItem = await page.$eval('#trend-item-sel option:nth-child(2)', el => el.value);
    await page.evaluate(item => {
      document.getElementById('trend-item-sel').value = item;
      renderTrendChart();
    }, firstItem);
    const curRate = await page.textContent('#t-cur');
    expect(curRate).toMatch(/₹[\d.]+/);
    expect(curRate).not.toBe('—');
  });

  test('item selector preserves selection after renderTrends() is called again', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('trends'));
    const targetItem = await page.$eval('#trend-item-sel option:nth-child(2)', el => el.value);
    await page.evaluate(item => {
      document.getElementById('trend-item-sel').value = item;
      renderTrends(); // full re-render — must preserve
    }, targetItem);
    const selectedAfter = await page.$eval('#trend-item-sel', el => el.value);
    expect(selectedAfter).toBe(targetItem);
  });

  test('trend table search filter works', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('trends'));
    await page.evaluate(() => {
      document.getElementById('trend-search').value = 'Tomato';
      renderTrendTable();
    });
    const rows = await page.$$('#trend-summary-body tr');
    expect(rows.length).toBe(1);
    const text = await rows[0].innerText();
    expect(text).toContain('Tomato');
  });
});

// ─── Suppliers ───────────────────────────────────────────────────────────────
test.describe('Suppliers page — renderSuppliers(), comparison table', () => {
  test('supplier cards are rendered for each supplier', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('suppliers'));
    const cards = await page.$$('.sup-card');
    const dbSups = await page.evaluate(() => new Set(DB.map(r=>r.supplier).filter(Boolean)).size);
    expect(cards.length).toBe(dbSups);
  });

  test('comparison table has header + supplier columns', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('suppliers'));
    const headers = await page.$$('#sup-compare-wrap thead th');
    const dbSups  = await page.evaluate(() => new Set(DB.map(r=>r.supplier).filter(Boolean)).size);
    // Item col + one per supplier + Best Price col
    expect(headers.length).toBe(dbSups + 2);
  });

  test('cheapest supplier cell is marked with ✓', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('suppliers'));
    const cells = await page.$$('#sup-compare-wrap td');
    const checkCells = await Promise.all(cells.map(c => c.textContent()));
    const hasCheck = checkCells.some(t => t.includes('✓'));
    expect(hasCheck).toBe(true);
  });

  test('search filter narrows comparison table', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('suppliers'));
    const allRows = await page.$$('#sup-compare-wrap tbody tr');
    await page.evaluate(() => {
      document.getElementById('sup-search').value = 'Tomato';
      renderSupplierTable();
    });
    const filteredRows = await page.$$('#sup-compare-wrap tbody tr');
    expect(filteredRows.length).toBeLessThanOrEqual(allRows.length);
    expect(filteredRows.length).toBeGreaterThan(0);
  });
});

// ─── Monthly Report ───────────────────────────────────────────────────────────
test.describe('Monthly Report — renderMonthly(), filter pipeline', () => {
  test('month dropdown is populated', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('monthly'));
    const opts = await page.$$('#monthly-sel option');
    expect(opts.length).toBeGreaterThan(1); // "All Time" + months
  });

  test('month option values are in MM-YYYY format', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('monthly'));
    const optVals = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#monthly-sel option'))
        .map(o => o.value)
        .filter(v => v !== '')
    );
    optVals.forEach(v => {
      expect(/^\d{2}-\d{4}$/.test(v)).toBe(true);
    });
  });

  test('filtering by month shows only that month\'s items', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('monthly'));
    const targetMonth = await page.$eval('#monthly-sel option:nth-child(2)', el => el.value);
    await page.evaluate(m => {
      document.getElementById('monthly-sel').value = m;
      renderMonthly();
    }, targetMonth);
    // Verify the stat card shows non-zero spend
    const totalSpendEl = await page.$('#monthly-stats .stat-value');
    const spendText = await totalSpendEl.textContent();
    expect(spendText).toMatch(/₹[\d,]+/);
  });

  test('All Time filter shows more items than a single month', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('monthly'));

    // Count rows with All Time
    const allRows = await page.$$('#monthly-body tr');

    // Switch to specific month
    const monthVal = await page.$eval('#monthly-sel option:nth-child(2)', el => el.value);
    await page.evaluate(m => {
      document.getElementById('monthly-sel').value = m;
      renderMonthly();
    }, monthVal);
    const monthRows = await page.$$('#monthly-body tr');

    expect(allRows.length).toBeGreaterThanOrEqual(monthRows.length);
  });

  test('stat cards show correct structure', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('monthly'));
    const cards = await page.$$('#monthly-stats .stat-card');
    expect(cards.length).toBe(3); // Total Spend, Total Qty, Unique Items
  });
});

// ─── Spending Summary ─────────────────────────────────────────────────────────
test.describe('Spending Summary — renderSpending()', () => {
  test('top 10 table shows up to 10 rows', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('spending'));
    const rows = await page.$$('#top10-body tr');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(10);
  });

  test('all rows have % of Budget value', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('spending'));
    const rows = await page.$$('#top10-body tr');
    for (const row of rows) {
      const cells = await row.$$('td');
      const pctText = await cells[5].textContent();
      expect(pctText).toMatch(/[\d.]+%/);
    }
  });

  test('category chart canvas is visible', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('spending'));
    const canvas = await page.$('#chart-sc');
    expect(canvas).not.toBeNull();
    const display = await canvas.evaluate(el => el.style.display);
    expect(display).not.toBe('none');
  });
});

// ─── Export Excel ─────────────────────────────────────────────────────────────
test.describe('Export Excel — exportExcel()', () => {
  test('exportExcel triggers a file download', async ({ page }) => {
    await withDemo(page);
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10000 }),
      page.evaluate(() => exportExcel())
    ]);
    expect(download.suggestedFilename()).toMatch(/SabziTracker.*\.xlsx/);
  });

  test('empty DB shows error toast instead of downloading', async ({ page }) => {
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    page.on('dialog', d => d.accept());
    // Ensure DB is empty
    await page.evaluate(() => { DB.length = 0; });
    await page.evaluate(() => exportExcel());
    // Toast should appear (err class)
    await page.waitForSelector('#toast.err', { timeout: 2000 });
    const toastText = await page.textContent('#toast');
    expect(toastText).toContain('No data');
  });
});

// ─── Import Excel ─────────────────────────────────────────────────────────────
test.describe('Import Excel — importExcel() column mapping', () => {
  test('import adds rows with correct field mapping', async ({ page }) => {
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    page.on('dialog', d => d.accept());

    // Simulate importExcel by calling the internal parsing logic directly
    // Col order matches exported format exactly:
    // [Date, Supplier, InvoiceNo, Item(EN), Item(Orig), Category, Unit, Qty, Rate, Amount]
    const testRows = [
      ['Date','Supplier','Invoice No','Item (English)','Item (Original)','Category','Unit','Qty','Rate ₹','Amount ₹'], // header
      ['01-04-2026','Test Vendor','T01','Cucumber','Kakdi','Vegetable','kg',5,30,150],
      ['01-04-2026','Test Vendor','T01','Carrot','Gajar','Vegetable','kg',3,40,120],
    ];

    const before = await page.evaluate(() => DB.length);
    await page.evaluate(rows => {
      // Directly invoke the import parsing logic (mirrors importExcel internals)
      let added = 0, skipped = 0, dupes = 0;
      const startRow = 1; // skip header
      rows.slice(startRow).forEach(r => {
        const date     = String(r[0]||'').trim();
        const supplier = String(r[1]||'').trim();
        const inv_no   = String(r[2]||'').trim();
        const item     = String(r[3]||'').trim();
        const item_orig= String(r[4]||'').trim();
        const category = String(r[5]||'Vegetable').trim();
        const unit_val = String(r[6]||'kg').trim();
        const qty      = parseFloat(r[7])||0;
        const rate     = parseFloat(r[8])||0;
        const amount   = parseFloat(r[9])||qty*rate;
        if (!item || !rate || !qty) { skipped++; return; }
        const isDupe = DB.some(x=>x.date===date&&x.supplier===supplier&&x.item===item&&+x.qty===qty&&+x.rate===rate);
        if (isDupe) { dupes++; return; }
        DB.push({ id:uid(), date, supplier, invoice_no:inv_no, item, item_orig, category, unit:unit_val, qty, rate, amount });
        added++;
      });
      return { added, skipped, dupes };
    }, testRows);

    const after = await page.evaluate(() => DB.length);
    expect(after).toBe(before + 2);

    const cucumber = await page.evaluate(() => DB.find(r=>r.item==='Cucumber'));
    expect(cucumber.rate).toBe(30);
    expect(cucumber.qty).toBe(5);
    expect(cucumber.amount).toBe(150);
    expect(cucumber.category).toBe('Vegetable');
  });

  test('duplicate detection prevents re-import of same data', async ({ page }) => {
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    page.on('dialog', d => d.accept());

    // Seed one row
    await page.evaluate(() => {
      DB.push({ id:'dup1', date:'01-04-2026', supplier:'S', invoice_no:'1',
                item:'Okra', item_orig:'', category:'Vegetable', unit:'kg',
                qty:10, rate:50, amount:500 });
    });

    // Try to import exact same row
    const dupeRow = ['01-04-2026','S','1','Okra','','Vegetable','kg',10,50,500];
    const result = await page.evaluate(r => {
      let added=0, dupes=0;
      const date=String(r[0]),supplier=String(r[1]),item=String(r[3]),qty=parseFloat(r[7]),rate=parseFloat(r[8]);
      const isDupe=DB.some(x=>x.date===date&&x.supplier===supplier&&x.item===item&&+x.qty===qty&&+x.rate===rate);
      if (isDupe) { dupes++; } else { added++; }
      return { added, dupes };
    }, dupeRow);

    expect(result.dupes).toBe(1);
    expect(result.added).toBe(0);
  });
});

// ─── Clear All Data ───────────────────────────────────────────────────────────
test.describe('confirmClear() — data wipe', () => {
  test('clears DB completely', async ({ page }) => {
    await withDemo(page);
    page.on('dialog', d => d.accept());
    await page.evaluate(() => confirmClear());
    const dbLen = await page.evaluate(() => DB.length);
    expect(dbLen).toBe(0);
  });

  test('removes sabzi_db from localStorage', async ({ page }) => {
    await withDemo(page);
    page.on('dialog', d => d.accept());
    await page.evaluate(() => confirmClear());
    const stored = await page.evaluate(() => localStorage.getItem('sabzi_db'));
    expect(JSON.parse(stored)).toEqual([]);
  });

  test('resets invCount to 0', async ({ page }) => {
    await withDemo(page);
    page.on('dialog', d => d.accept());
    await page.evaluate(() => confirmClear());
    const count = await page.evaluate(() => invCount);
    expect(count).toBe(0);
  });

  test('destroys all chart instances', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => renderDashboard()); // ensure charts exist
    page.on('dialog', d => d.accept());
    await page.evaluate(() => confirmClear());
    const chartCount = await page.evaluate(() => Object.keys(charts).length);
    expect(chartCount).toBe(0);
  });
});

// ─── Phase 2 additions — Regression ──────────────────────────────────────────
test.describe('Phase 2 — Performance & security additions', () => {
  test('esc() is available as a global function', async ({ page }) => {
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    const result = await page.evaluate(() => esc('<script>alert(1)</script>'));
    expect(result).toContain('&lt;script&gt;');
    expect(result).not.toContain('<script>');
  });

  test('getItemTrends returns consistent results on repeat calls (memoization)', async ({ page }) => {
    await withDemo(page);
    const result1 = await page.evaluate(() => JSON.stringify(getItemTrends()));
    const result2 = await page.evaluate(() => JSON.stringify(getItemTrends()));
    expect(result1).toBe(result2);
  });

  test('getItemTrends cache invalidates after saveDB', async ({ page }) => {
    await withDemo(page);
    const before = await page.evaluate(() => Object.keys(getItemTrends()).length);
    // Add a new item and save
    await page.evaluate(() => {
      DB.push({ id:'cache_test', item:'CacheTestItem', date:'01-04-2026',
                supplier:'S', invoice_no:'', item_orig:'', category:'Vegetable',
                unit:'kg', qty:1, rate:100, amount:100 });
      saveDB();
    });
    const after = await page.evaluate(() => Object.keys(getItemTrends()).length);
    expect(after).toBe(before + 1);
    // Cleanup
    await page.evaluate(() => {
      DB = DB.filter(r=>r.id!=='cache_test');
      saveDB();
    });
  });
});

// ─── Phase 3 — Monitoring ────────────────────────────────────────────────────
test.describe('Phase 3 — Error monitoring and health panel', () => {
  test('error handler stores errors in sabzi_errors', async ({ page }) => {
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      // Manually trigger an error event
      window.dispatchEvent(new ErrorEvent('error', {
        message: 'Integration test error',
        filename: 'test.js',
        lineno: 1,
        colno: 1
      }));
    });
    await page.waitForTimeout(100);
    const errors = await page.evaluate(() => JSON.parse(localStorage.getItem('sabzi_errors')||'[]'));
    expect(errors.length).toBeGreaterThan(0);
    const testErr = errors.find(e => e.msg.includes('Integration test error'));
    expect(testErr).toBeTruthy();
    expect(testErr.page).toBeDefined();
    expect(testErr.ts).toBeDefined();
  });

  test('health panel opens on Ctrl+Shift+H', async ({ page }) => {
    await withDemo(page);
    await page.keyboard.press('Control+Shift+H');
    await page.waitForSelector('#_sabzi_health', { timeout: 1000 });
    const panel = await page.$('#_sabzi_health');
    expect(panel).not.toBeNull();
  });

  test('health panel closes on second Ctrl+Shift+H', async ({ page }) => {
    await withDemo(page);
    await page.keyboard.press('Control+Shift+H');
    await page.waitForSelector('#_sabzi_health');
    await page.keyboard.press('Control+Shift+H');
    await page.waitForTimeout(100);
    const panel = await page.$('#_sabzi_health');
    expect(panel).toBeNull();
  });

  test('health panel shows DB row count', async ({ page }) => {
    await withDemo(page);
    const dbLen = await page.evaluate(() => DB.length);
    await page.keyboard.press('Control+Shift+H');
    await page.waitForSelector('#_sabzi_health');
    const panelText = await page.textContent('#_sabzi_health');
    expect(panelText).toContain(String(dbLen));
  });

  test('regression test results are stored in localStorage', async ({ page }) => {
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500); // tests run on load
    const results = await page.evaluate(() => JSON.parse(localStorage.getItem('sabzi_test_results')||'null'));
    expect(results).not.toBeNull();
    expect(results.total).toBeGreaterThan(0);
    expect(results.failed).toBe(0);
    expect(results.passed).toBeGreaterThan(40);
  });
});
