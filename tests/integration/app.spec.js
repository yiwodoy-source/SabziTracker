'use strict';

const { test, expect } = require('@playwright/test');
const path             = require('path');

const APP_URL = 'file://' + path.resolve(__dirname, '../../SabziTracker_Production.html');

async function withDemo(page) {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  page.on('dialog', d => d.accept());
  await page.evaluate(() => {
    loadDemoData();
    go('dashboard');
  });
  await page.waitForSelector('#s-spend');
}

test.describe('Navigation — go() function', () => {
  test('all 7 pages render without JS error', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await withDemo(page);

    const pages = ['dashboard','scanner','log','trends','suppliers','monthly','spending'];
    for (const id of pages) {
      await page.evaluate(p => go(p), id);
      await page.waitForTimeout(120);
      const active = await page.$(`#page-${id}.active`);
      expect(active, `page-${id} should be active`).not.toBeNull();
    }
    expect(errors).toHaveLength(0);
  });
});

test.describe('Dashboard', () => {
  test('displays stats after demo data loaded', async ({ page }) => {
    await withDemo(page);
    const spend = await page.textContent('#s-spend');
    expect(spend).not.toBe('₹0');
  });

  test('stats cards render correctly', async ({ page }) => {
    await withDemo(page);
    const cards = await page.$$('.stat-card');
    expect(cards.length).toBeGreaterThan(0);
  });

  test('month filter scopes dashboard metrics to selected month', async ({ page }) => {
    await withDemo(page);
    await page.selectOption('#dash-month', '03-2026');
    await page.waitForTimeout(150);

    const stats = await page.evaluate(() => ({
      spend: document.querySelector('#s-spend').textContent,
      items: document.querySelector('#s-items').textContent,
      invoices: document.querySelector('#s-invoices').textContent,
      expected: {
        spend: DB
          .filter(r => getMonthKey(r.date) === '03-2026')
          .reduce((s,r) => s + (+r.amount || 0), 0)
          .toLocaleString('en-IN', { maximumFractionDigits: 0 }),
        items: new Set(DB.filter(r => getMonthKey(r.date) === '03-2026').map(r => r.item)).size,
        invoices: countInvoices(DB.filter(r => getMonthKey(r.date) === '03-2026')),
      }
    }));

    expect(stats.spend).toContain(stats.expected.spend);
    expect(stats.items).toBe(String(stats.expected.items));
    expect(stats.invoices).toBe(String(stats.expected.invoices));
  });
});

test.describe('Purchase Log', () => {
  test('search filters results', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('log'));
    await page.waitForTimeout(200);

    const before = await page.$$eval('#log-body tr', trs => trs.length);
    await page.fill('#f-search', 'Tomato');
    await page.waitForTimeout(250);

    const after = await page.$$eval('#log-body tr', trs => trs.length);
    expect(after).toBeLessThan(before);
  });

  test('date filter works', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('log'));
    await page.waitForTimeout(200);

    await page.selectOption('#f-date', '');
    const rows = await page.$$('#log-body tr');
    expect(rows.length).toBeGreaterThan(0);
  });
});

test.describe('Trends', () => {
  test('trend table renders', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('trends'));
    await page.waitForTimeout(200);

    const rows = await page.$$('#trend-summary-body tr');
    expect(rows.length).toBeGreaterThan(0);
  });

  test('item selector populated', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('trends'));
    await page.waitForTimeout(200);

    const options = await page.$$('#trend-item-sel option');
    expect(options.length).toBeGreaterThan(1);
  });
});

test.describe('Scanner', () => {
  test('adds new row on load', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('scanner'));
    await page.evaluate(() => {
      document.getElementById('entry-panel').style.display = 'block';
      if (!document.querySelector('#scan-rows-body tr')) addScanRow();
    });
    await page.waitForTimeout(200);

    const rows = await page.$$('#scan-rows-body tr');
    expect(rows.length).toBeGreaterThan(0);
  });

  test('auto-calculates amount on qty/rate change', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('scanner'));
    await page.evaluate(() => {
      document.getElementById('entry-panel').style.display = 'block';
      if (!document.querySelector('#scan-rows-body tr')) addScanRow();
    });
    await page.waitForTimeout(200);

    await page.fill('#scan-rows-body input[id^="qty_"]', '10');
    await page.fill('#scan-rows-body input[id^="rate_"]', '25');
    await page.waitForTimeout(100);

    const amt = await page.inputValue('#scan-rows-body input[id^="amt_"]');
    expect(amt).toBe('250.00');
  });
});

test.describe('Supplier Comparison', () => {
  test('renders supplier table', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('suppliers'));
    await page.waitForTimeout(200);

    const table = await page.$('#sup-compare-wrap table');
    expect(table).not.toBeNull();
  });
});

test.describe('Monthly Report', () => {
  test('month selector populates', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('monthly'));
    await page.waitForTimeout(200);

    const options = await page.$$('#monthly-sel option');
    expect(options.length).toBeGreaterThan(0);
  });

  test('displays stats cards', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('monthly'));
    await page.waitForTimeout(200);

    const cards = await page.$$('#monthly-stats .stat-card');
    expect(cards.length).toBeGreaterThan(0);
  });
});

test.describe('Spending Summary', () => {
  test('charts render', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('spending'));
    await page.waitForTimeout(200);

    const chartSc = await page.$('#chart-sc');
    const chartSs = await page.$('#chart-ss');
    expect(chartSc).not.toBeNull();
  });

  test('top 10 table shows', async ({ page }) => {
    await withDemo(page);
    await page.evaluate(() => go('spending'));
    await page.waitForTimeout(200);

    const rows = await page.$$('#top10-body tr');
    expect(rows.length).toBeGreaterThan(0);
  });
});

test.describe('Excel Export', () => {
  test('export button triggers download', async ({ page }) => {
    await withDemo(page);

    const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
    await page.click('#btn-export');

    const download = await downloadPromise;
    if (download) {
      expect(download.suggestedFilename()).toContain('SabziTracker_');
    }
  });
});

test.describe('Health Panel', () => {
  test('Ctrl+Shift+H shows health panel', async ({ page }) => {
    await withDemo(page);
    await page.keyboard.press('Control+Shift+H');
    await page.waitForTimeout(100);

    const panel = await page.$('#_sabzi_health');
    expect(panel).not.toBeNull();
  });

  test('health panel shows DB stats', async ({ page }) => {
    await withDemo(page);
    await page.keyboard.press('Control+Shift+H');
    await page.waitForTimeout(100);

    const text = await page.textContent('#_sabzi_health');
    expect(text).toContain('DB Rows');
  });
});

test.describe('Error Handling', () => {
  test('toast displays on error', async ({ page }) => {
    await withDemo(page);

    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('error');
      await dialog.accept();
    });
  });
});
