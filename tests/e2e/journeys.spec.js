'use strict';

const { test, expect } = require('@playwright/test');
const path             = require('path');

const APP_URL = 'file://' + path.resolve(__dirname, '../../SabziTracker_Production.html');

test('Journey 1 — First-time user: empty state → load demo → explore all pages', async ({ page }) => {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  page.on('dialog', d => d.accept());

  const spend = await page.textContent('#s-spend');
  expect(spend).toBe('₹0');

  await page.evaluate(() => loadDemoData());
  await page.waitForTimeout(200);

  const spendAfter = await page.textContent('#s-spend');
  expect(spendAfter).not.toBe('₹0');

  const pages = ['scanner','log','trends','suppliers','monthly','spending','dashboard'];
  for (const p of pages) {
    await page.evaluate(id => go(id), p);
    await page.waitForTimeout(150);
    const active = await page.$(`#page-${p}.active`);
    expect(active, `${p} page should be active`).not.toBeNull();
    const errorDlg = page.waitForEvent('dialog', { timeout: 200 }).catch(() => null);
    expect(await errorDlg).toBeNull();
  }
});

test('Journey 2 — Manual entry: open modal → fill all fields → save → verify in log', async ({ page }) => {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  page.on('dialog', d => d.accept());
  await page.evaluate(() => loadDemoData());
  await page.waitForTimeout(200);

  await page.evaluate(() => go('log'));
  await page.waitForTimeout(200);
  await page.click('#btn-add');
  await page.waitForSelector('#m-item', { state: 'visible' });

  await page.fill('#m-date', '05-04-2026');
  await page.fill('#m-item', 'Cucumber');
  await page.fill('#m-sup', 'Local Market');
  await page.fill('#m-qty', '5');
  await page.fill('#m-rate', '30');
  await page.click('#btn-save');
  await page.waitForTimeout(300);

  await page.evaluate(() => go('log'));
  await page.waitForTimeout(300);

  const rows = await page.$$('#log-body tr');
  expect(rows.length).toBeGreaterThan(0);
});

test('Journey 3 — Search and filter in Purchase Log', async ({ page }) => {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  page.on('dialog', d => d.accept());
  await page.evaluate(() => loadDemoData());
  await page.waitForTimeout(200);

  await page.evaluate(() => go('log'));
  await page.waitForTimeout(300);

  const before = await page.$$eval('#log-body tr', trs => trs.length);

  await page.fill('#f-search', 'Tomato');
  await page.waitForTimeout(300);

  const after = await page.$$eval('#log-body tr', trs => trs.length);
  expect(after).toBeLessThan(before);
  expect(after).toBeGreaterThan(0);
});

test('Journey 4 — View trends and switch items', async ({ page }) => {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  page.on('dialog', d => d.accept());
  await page.evaluate(() => loadDemoData());
  await page.waitForTimeout(200);

  await page.evaluate(() => go('trends'));
  await page.waitForTimeout(300);

  const options = await page.$$('#trend-item-sel option');
  expect(options.length).toBeGreaterThan(1);

  const chart = await page.$('#chart-item');
  expect(chart).not.toBeNull();
});

test('Journey 5 — Supplier comparison', async ({ page }) => {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  page.on('dialog', d => d.accept());
  await page.evaluate(() => loadDemoData());
  await page.waitForTimeout(200);

  await page.evaluate(() => go('suppliers'));
  await page.waitForTimeout(300);

  const table = await page.$('#sup-compare-wrap table');
  expect(table).not.toBeNull();

  await page.fill('#sup-search', 'Tomato');
  await page.waitForTimeout(300);
});

test('Journey 6 — Monthly report filter', async ({ page }) => {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  page.on('dialog', d => d.accept());
  await page.evaluate(() => loadDemoData());
  await page.waitForTimeout(200);

  await page.evaluate(() => go('monthly'));
  await page.waitForTimeout(300);

  const options = await page.$$('#monthly-sel option');
  expect(options.length).toBeGreaterThan(1);

  const value = await options[1].getAttribute('value');
  await page.selectOption('#monthly-sel', value);
  await page.waitForTimeout(300);

  const rows = await page.$$('#monthly-body tr');
  expect(rows.length).toBeGreaterThan(0);
});

test('Journey 7 — Spending summary charts', async ({ page }) => {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  page.on('dialog', d => d.accept());
  await page.evaluate(() => loadDemoData());
  await page.waitForTimeout(200);

  await page.evaluate(() => go('spending'));
  await page.waitForTimeout(300);

  const chartSc = await page.$('#chart-sc');
  const chartSs = await page.$('#chart-ss');
  expect(chartSc).not.toBeNull();
  expect(chartSs).not.toBeNull();

  const top10 = await page.$$('#top10-body tr');
  expect(top10.length).toBeGreaterThan(0);
});

test('Journey 8 — Export Excel and verify download', async ({ page }) => {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  page.on('dialog', d => d.accept());
  await page.evaluate(() => loadDemoData());
  await page.waitForTimeout(200);

  const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
  await page.click('#btn-export');

  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^SabziTracker_\d{4}-\d{2}-\d{2}\.xlsx$/);
});

test('Journey 9 — Health panel access', async ({ page }) => {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  page.on('dialog', d => d.accept());
  await page.evaluate(() => loadDemoData());
  await page.waitForTimeout(200);

  await page.keyboard.press('Control+Shift+H');
  await page.waitForTimeout(200);

  const panel = await page.$('#_sabzi_health');
  expect(panel).not.toBeNull();

  const text = await page.textContent('#_sabzi_health');
  expect(text).toContain('DB Rows');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
});

test('Journey 10 — Scanner: add multiple items and save', async ({ page }) => {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  page.on('dialog', d => d.accept());

  await page.evaluate(() => go('scanner'));
  await page.evaluate(() => {
    document.getElementById('invoice-preview-wrap').style.display = 'block';
    document.getElementById('invoice-empty').style.display = 'none';
    document.getElementById('entry-panel').style.display = 'block';
    if (!document.querySelector('#scan-rows-body tr')) addScanRow();
  });
  await page.waitForTimeout(200);

  await page.fill('#scan-date', '06-04-2026');
  await page.fill('#scan-supplier', 'Test Supplier');

  await page.fill('#scan-rows-body input[id^="item_"]', 'Carrot');
  await page.fill('#scan-rows-body input[id^="qty_"]', '2');
  await page.fill('#scan-rows-body input[id^="rate_"]', '40');
  await page.waitForTimeout(100);

  await page.keyboard.press('Tab');
  await page.waitForTimeout(100);

  await page.click('#add-all-btn');
  await page.waitForTimeout(300);

  await page.evaluate(() => go('log'));
  await page.waitForTimeout(300);

  const rows = await page.$$('#log-body tr');
  expect(rows.length).toBeGreaterThan(0);
});
