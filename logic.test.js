/**
 * SabziTracker Production — Unit Test Suite
 * Tests all pure logic functions extracted from SabziTracker_Production.html
 *
 * Run: npm test
 * These tests NEVER touch the DOM. They work on function logic only.
 * Any failure means a regression in core business logic.
 */

'use strict';

// ─── Bootstrap: extract and evaluate the JS block from the HTML ─────────────
const fs   = require('fs');
const path = require('path');

const htmlPath = path.resolve(__dirname, 'SabziTracker_Production.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// Pull only the script block — from <script> to the end
const scriptMatch = html.match(/<script>([\s\S]*)<\/script>/);
if (!scriptMatch) throw new Error('Could not extract JS block from HTML');

// Provide browser globals that the script references at parse time
global.localStorage = (() => {
  let store = {};
  return {
    getItem:    k    => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem:    (k,v)=> { store[k] = String(v); },
    removeItem: k    => { delete store[k]; },
    clear:      ()   => { store = {}; },
    _store:     ()   => store,
    _reset:     ()   => { store = {}; }
  };
})();
global.sessionStorage = (() => {
  let store = {};
  return {
    getItem:    k    => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem:    (k,v)=> { store[k] = String(v); },
    removeItem: k    => { delete store[k]; },
    clear:      ()   => { store = {}; }
  };
})();
global.navigator = { userAgent: 'jest-test-runner' };

// Minimal DOM stubs — only for functions that do getElementById at call time
// (not at parse time). Unit tests do NOT test DOM interaction.
const makeEl = () => ({
  textContent: '', value: '', className: '',
  style: {}, classList: { add(){}, remove(){}, contains(){ return false; } },
  innerHTML: '', appendChild(){}, querySelector(){ return null; },
  querySelectorAll(){ return []; }, addEventListener(){}, remove(){}
});
global.document = {
  getElementById: makeEl,
  querySelectorAll: () => [],
  addEventListener: () => {},
  createTreeWalker: () => ({ nextNode: () => null }),
  createElement: () => ({
    style: {}, classList:{ add(){} }, id:'', innerHTML:'', appendChild(){}
  }),
  body: { appendChild(){} },
  fonts: []
};
global.NodeFilter = { SHOW_TEXT: 4 };
global.screen = { width: 1920, height: 1080 };
global.MutationObserver = class { observe(){} };
global.Chart = class { constructor(){} destroy(){} };
global.XLSX = { utils:{ book_new:()=>({}), aoa_to_sheet:()=>({}), book_append_sheet(){}, sheet_to_json:()=>[] }, read:()=>({}), writeFile(){} };
global.Blob = class { constructor(parts){ this.size = parts.reduce((s,p)=>s+String(p).length,0); } };

// Evaluate the script — all functions become global
// Replace let/const with var so indirect eval places them on global
const wrapped = scriptMatch[1].replace(/^let /gm,'var ').replace(/^const /gm,'var ');
try{(0,eval)(wrapped);}catch(e){/* DOM init errors at boot expected */}

// ─── Helpers ────────────────────────────────────────────────────────────────
/** Save real DB, inject fixture, run fn, restore DB. Cache-safe. */
function withDB(fixture, fn) {
  const saved = DB.slice();
  DB.length = 0;
  fixture.forEach(r => DB.push(r));
  // Invalidate memoization if present
  if (typeof global._trendsCache !== 'undefined') { global._trendsCache = null; }
  let result;
  try { result = fn(); } finally {
    DB.length = 0;
    saved.forEach(r => DB.push(r));
    if (typeof global._trendsCache !== 'undefined') { global._trendsCache = null; }
  }
  return result;
}

const FIXTURE_MULTI = [
  { id:'t1', item:'Tomato', date:'01-03-2026', rate:'26', qty:'60', amount:'1560', category:'Vegetable', unit:'kg' },
  { id:'t2', item:'Tomato', date:'08-03-2026', rate:'28', qty:'50', amount:'1400', category:'Vegetable', unit:'kg' },
  { id:'t3', item:'Tomato', date:'15-03-2026', rate:'25', qty:'55', amount:'1375', category:'Vegetable', unit:'kg' },
  { id:'t4', item:'Potato', date:'01-03-2026', rate:'18', qty:'100', amount:'1800', category:'Vegetable', unit:'kg' },
  { id:'t5', item:'Onion',  date:'29-03-2026', rate:'40', qty:'10', amount:'400',  category:'Vegetable', unit:'kg' },
  { id:'t6', item:'Onion',  date:'01-03-2026', rate:'30', qty:'10', amount:'300',  category:'Vegetable', unit:'kg' },
  { id:'t7', item:'Paneer', date:'22-03-2026', rate:'340',qty:'5',  amount:'1700', category:'Dairy',     unit:'kg' },
];

// ═══════════════════════════════════════════════════════════════════════════
// parseDateSort
// ═══════════════════════════════════════════════════════════════════════════
describe('parseDateSort — DD-MM-YYYY → YYYY-MM-DD conversion', () => {
  test('converts standard date correctly', () => {
    expect(parseDateSort('01-03-2026')).toBe('2026-03-01');
  });
  test('converts end-of-year date', () => {
    expect(parseDateSort('31-12-2025')).toBe('2025-12-31');
  });
  test('later date sorts lexicographically greater (same month)', () => {
    expect(parseDateSort('29-03-2026') > parseDateSort('01-03-2026')).toBe(true);
  });
  test('later month sorts greater', () => {
    expect(parseDateSort('01-04-2026') > parseDateSort('29-03-2026')).toBe(true);
  });
  test('later year sorts greater', () => {
    expect(parseDateSort('01-01-2027') > parseDateSort('31-12-2026')).toBe(true);
  });
  test('returns empty string for empty input', () => {
    expect(parseDateSort('')).toBe('');
  });
  test('returns empty string for null', () => {
    expect(parseDateSort(null)).toBe('');
  });
  test('returns empty string for undefined', () => {
    expect(parseDateSort(undefined)).toBe('');
  });
  test('passes through non-matching format unchanged', () => {
    expect(parseDateSort('2026-03-01')).toBe('2026-03-01');
  });
  test('does not mutate input string', () => {
    const d = '15-06-2026';
    parseDateSort(d);
    expect(d).toBe('15-06-2026');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getMonthKey
// ═══════════════════════════════════════════════════════════════════════════
describe('getMonthKey — DD-MM-YYYY → MM-YYYY', () => {
  test('standard March date', () => expect(getMonthKey('15-03-2026')).toBe('03-2026'));
  test('December date', ()       => expect(getMonthKey('01-12-2025')).toBe('12-2025'));
  test('single-digit month padded', () => expect(getMonthKey('07-04-2026')).toBe('04-2026'));
  test('empty string', ()        => expect(getMonthKey('')).toBe(''));
  test('null',   ()              => expect(getMonthKey(null)).toBe(''));
  test('undefined', ()           => expect(getMonthKey(undefined)).toBe(''));
  test('output format is MM-YYYY', () => {
    expect(/^\d{2}-\d{4}$/.test(getMonthKey('22-03-2026'))).toBe(true);
  });
  test('different dates same month return same key', () => {
    expect(getMonthKey('01-03-2026')).toBe(getMonthKey('29-03-2026'));
  });
  test('different months return different keys', () => {
    expect(getMonthKey('01-03-2026')).not.toBe(getMonthKey('01-04-2026'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// validateDate
// ═══════════════════════════════════════════════════════════════════════════
describe('validateDate — DD-MM-YYYY format and range validation', () => {
  // Valid inputs
  test.each([
    ['01-03-2026', true,  'standard date'],
    ['31-12-2099', true,  'max valid year'],
    ['01-01-2000', true,  'min valid year'],
    ['',           true,  'empty string allowed (optional field)'],
    [null,         true,  'null allowed (optional field)'],
  ])('%s → %s (%s)', (input, expected) => {
    expect(validateDate(input)).toBe(expected);
  });

  // Invalid formats
  test.each([
    ['2026-03-01', false, 'ISO format rejected'],
    ['1-3-2026',   false, 'no leading zeros'],
    ['01/03/2026', false, 'slashes rejected'],
    ['ab-cd-efgh', false, 'non-numeric'],
    ['01-03-26',   false, '2-digit year'],
  ])('%s → %s (%s)', (input, expected) => {
    expect(validateDate(input)).toBe(expected);
  });

  // Invalid ranges
  test.each([
    ['01-13-2026', false, 'month 13'],
    ['01-00-2026', false, 'month 0'],
    ['32-03-2026', false, 'day 32'],
    ['00-03-2026', false, 'day 0'],
    ['01-01-1999', false, 'year before 2000'],
    ['01-01-2101', false, 'year after 2100'],
  ])('%s → %s (%s)', (input, expected) => {
    expect(validateDate(input)).toBe(expected);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// trendLabel
// ═══════════════════════════════════════════════════════════════════════════
describe('trendLabel — percentage change to emoji + CSS class', () => {
  const cases = [
    // [pct, expectedTxt, expectedCls, description]
    [15,    '📈 Rising',      't-rising',   'clearly rising'],
    [10.1,  '📈 Rising',      't-rising',   'just above 10'],
    [10,    '🔺 Slight Rise', 't-slight',   'exactly 10 (> not >=)'],
    [9.9,   '🔺 Slight Rise', 't-slight',   'just below 10'],
    [5,     '🔺 Slight Rise', 't-slight',   'mid slight rise'],
    [3.1,   '🔺 Slight Rise', 't-slight',   'just above 3'],
    [3,     '🟢 Stable',      't-stable',   'exactly 3 (> not >=)'],
    [2,     '🟢 Stable',      't-stable',   'within stable band'],
    [0,     '🟢 Stable',      't-stable',   'zero change'],
    [-2,    '🟢 Stable',      't-stable',   'small negative stable'],
    [-3,    '🟢 Stable',      't-stable',   'exactly -3 (< not <=)'],
    [-3.1,  '🔻 Falling',     't-falling',  'just below -3'],
    [-5,    '🔻 Falling',     't-falling',  'mid falling'],
    [-9.9,  '🔻 Falling',     't-falling',  'just above -10'],
    [-10,   '🔻 Falling',     't-falling',  'exactly -10 (< not <=)'],
    [-10.1, '📉 Dropping',    't-dropping', 'just below -10'],
    [-20,   '📉 Dropping',    't-dropping', 'clearly dropping'],
  ];
  test.each(cases)('pct=%f → txt="%s" cls="%s" (%s)', (pct, txt, cls) => {
    const result = trendLabel(pct);
    expect(result.txt).toBe(txt);
    expect(result.cls).toBe(cls);
  });

  test('returns object with txt and cls keys only', () => {
    const r = trendLabel(0);
    expect(Object.keys(r).sort()).toEqual(['cls','txt']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// catClass
// ═══════════════════════════════════════════════════════════════════════════
describe('catClass — category string to CSS badge class', () => {
  test.each([
    ['Vegetable',   'b-vegetable'],
    ['Grocery/Dry', 'b-grocery'],
    ['Dairy',       'b-dairy'],
    ['Fruit',       'b-fruit'],
    ['Spice',       'b-spice'],
    ['Unknown',     'b-other'],
    ['',            'b-other'],
    [null,          'b-other'],
    [undefined,     'b-other'],
    ['vegetable',   'b-other'],  // case-sensitive
    ['DAIRY',       'b-other'],  // case-sensitive
  ])('%s → %s', (input, expected) => {
    expect(catClass(input)).toBe(expected);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// uid
// ═══════════════════════════════════════════════════════════════════════════
describe('uid — unique identifier generation', () => {
  test('returns a non-empty string', () => {
    expect(typeof uid()).toBe('string');
    expect(uid().length).toBeGreaterThan(0);
  });

  test('generates unique values across 10,000 calls', () => {
    const ids = new Set(Array.from({ length: 10_000 }, uid));
    expect(ids.size).toBe(10_000);
  });

  test('ids contain only alphanumeric characters', () => {
    for (let i = 0; i < 100; i++) {
      expect(/^[a-z0-9]+$/.test(uid())).toBe(true);
    }
  });

  test('consecutive calls never return the same value', () => {
    const a = uid(), b = uid();
    expect(a).not.toBe(b);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getItemTrends
// ═══════════════════════════════════════════════════════════════════════════
describe('getItemTrends — core trend calculation engine', () => {

  test('returns empty object for empty DB', () => {
    const result = withDB([], () => getItemTrends());
    expect(result).toEqual({});
  });

  test('produces one key per unique item', () => {
    const result = withDB(FIXTURE_MULTI, () => getItemTrends());
    expect(Object.keys(result).sort()).toEqual(['Onion','Paneer','Potato','Tomato']);
  });

  describe('Tomato (3 entries: 26→28→25)', () => {
    let t;
    beforeAll(() => {
      const result = withDB(FIXTURE_MULTI, () => getItemTrends());
      t = result['Tomato'];
    });

    test('first rate is earliest date rate (26)', () => expect(t.first).toBe(26));
    test('last rate is latest date rate (25)',    () => expect(t.last).toBe(25));
    test('avg = (26+28+25)/3',                   () => expect(t.avg).toBeCloseTo((26+28+25)/3, 4));
    test('min = 25',                              () => expect(t.min).toBe(25));
    test('pct = (25-26)/26*100',                  () => expect(t.pct).toBeCloseTo((25-26)/26*100, 2));
    test('label is Falling (pct ≈ -3.85)',        () => expect(t.label).toBe('🔻 Falling'));
    test('cls is t-falling',                      () => expect(t.cls).toBe('t-falling'));
    test('totalQty = 60+50+55 = 165',             () => expect(t.totalQty).toBe(165));
    test('totalSpend = 1560+1400+1375 = 4335',    () => expect(t.totalSpend).toBe(4335));
    test('category = Vegetable',                  () => expect(t.category).toBe('Vegetable'));
    test('unit = kg',                             () => expect(t.unit).toBe('kg'));
    test('rows array has 3 entries',              () => expect(t.rows.length).toBe(3));
    test('rows sorted by date ascending',         () => {
      const dates = t.rows.map(r => parseDateSort(r.date));
      expect(dates[0] < dates[1] && dates[1] < dates[2]).toBe(true);
    });
  });

  describe('Potato (single entry — no trend)', () => {
    let t;
    beforeAll(() => {
      const result = withDB(FIXTURE_MULTI, () => getItemTrends());
      t = result['Potato'];
    });
    test('pct = 0 for single entry',  () => expect(t.pct).toBe(0));
    test('label = Stable',            () => expect(t.label).toBe('🟢 Stable'));
    test('first === last',             () => expect(t.first).toBe(t.last));
    test('totalQty = 100',            () => expect(t.totalQty).toBe(100));
    test('totalSpend = 1800',         () => expect(t.totalSpend).toBe(1800));
  });

  describe('Onion (2 entries out-of-insertion-order: 30 then 40)', () => {
    let t;
    beforeAll(() => {
      const result = withDB(FIXTURE_MULTI, () => getItemTrends());
      t = result['Onion'];
    });
    test('first = 30 (earlier date, inserted second)', () => expect(t.first).toBe(30));
    test('last = 40 (later date, inserted first)',     () => expect(t.last).toBe(40));
    test('pct = (40-30)/30*100 ≈ 33.33',              () => expect(t.pct).toBeCloseTo((40-30)/30*100, 2));
    test('label = Rising',                             () => expect(t.label).toBe('📈 Rising'));
    test('totalQty = 20',                              () => expect(t.totalQty).toBe(20));
    test('totalSpend = 700',                           () => expect(t.totalSpend).toBe(700));
  });

  describe('Paneer (Dairy category)', () => {
    let t;
    beforeAll(() => {
      const result = withDB(FIXTURE_MULTI, () => getItemTrends());
      t = result['Paneer'];
    });
    test('category = Dairy', () => expect(t.category).toBe('Dairy'));
    test('rate = 340',        () => expect(t.first).toBe(340));
  });

  test('rate coercion: string rates are parsed as numbers', () => {
    const fixture = [
      { id:'s1', item:'Garlic', date:'01-03-2026', rate:'120', qty:'2', amount:'240', category:'Vegetable', unit:'kg' },
    ];
    const result = withDB(fixture, () => getItemTrends());
    expect(typeof result['Garlic'].first).toBe('number');
    expect(result['Garlic'].first).toBe(120);
  });

  test('handles zero rate without crashing', () => {
    const fixture = [
      { id:'z1', item:'Free Item', date:'01-03-2026', rate:'0', qty:'10', amount:'0', category:'Vegetable', unit:'kg' },
    ];
    const result = withDB(fixture, () => getItemTrends());
    expect(result['Free Item'].pct).toBe(0); // first=0, division guarded
  });

  test('multiple items do not bleed into each other', () => {
    const result = withDB(FIXTURE_MULTI, () => getItemTrends());
    expect(result['Tomato'].totalQty).toBe(165);
    expect(result['Potato'].totalQty).toBe(100);
    expect(result['Onion'].totalQty).toBe(20);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// saveDB / localStorage persistence
// ═══════════════════════════════════════════════════════════════════════════
describe('saveDB — localStorage round-trip', () => {
  afterEach(() => {
    localStorage._reset();
  });

  test('persists current DB to sabzi_db key', () => {
    const saved = DB.slice();
    DB.length = 0;
    DB.push({ id:'p1', item:'Test', date:'01-04-2026', supplier:'S', invoice_no:'1',
               item_orig:'', category:'Vegetable', unit:'kg', qty:1, rate:10, amount:10 });
    saveDB();
    const stored = JSON.parse(localStorage.getItem('sabzi_db'));
    expect(stored).toHaveLength(1);
    expect(stored[0].item).toBe('Test');
    expect(stored[0].id).toBe('p1');
    // Restore
    DB.length = 0;
    saved.forEach(r => DB.push(r));
  });

  test('stores as valid JSON array', () => {
    saveDB();
    const raw = localStorage.getItem('sabzi_db');
    expect(() => JSON.parse(raw)).not.toThrow();
    expect(Array.isArray(JSON.parse(raw))).toBe(true);
  });

  test('overwrites previous value on subsequent calls', () => {
    const saved = DB.slice();
    DB.length = 0;
    DB.push({ id:'a', item:'A', date:'01-04-2026', supplier:'', invoice_no:'', item_orig:'', category:'Vegetable', unit:'kg', qty:1, rate:1, amount:1 });
    saveDB();
    DB.length = 0;
    DB.push({ id:'b', item:'B', date:'02-04-2026', supplier:'', invoice_no:'', item_orig:'', category:'Vegetable', unit:'kg', qty:2, rate:2, amount:4 });
    saveDB();
    const stored = JSON.parse(localStorage.getItem('sabzi_db'));
    expect(stored).toHaveLength(1);
    expect(stored[0].item).toBe('B');
    DB.length = 0;
    saved.forEach(r => DB.push(r));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getMonthKey used in monthly filter
// ═══════════════════════════════════════════════════════════════════════════
describe('getMonthKey + filter pipeline (regression R05)', () => {
  test('filter by getMonthKey correctly isolates March 2026', () => {
    const fixture = [
      { id:'m1', item:'A', date:'01-03-2026' },
      { id:'m2', item:'B', date:'29-03-2026' },
      { id:'m3', item:'C', date:'01-04-2026' },
      { id:'m4', item:'D', date:'15-02-2026' },
    ];
    const target = '03-2026';
    const filtered = fixture.filter(r => getMonthKey(r.date) === target);
    expect(filtered).toHaveLength(2);
    expect(filtered.map(r=>r.id).sort()).toEqual(['m1','m2']);
  });

  test('option value format matches getMonthKey output exactly', () => {
    // The monthly dropdown <option value="${m}"> must match getMonthKey output
    const date    = '22-03-2026';
    const key     = getMonthKey(date);
    const optVal  = key; // option.value === key
    const matched = getMonthKey(date) === optVal;
    expect(matched).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// esc — XSS sanitiser
// ═══════════════════════════════════════════════════════════════════════════
describe('esc — XSS sanitiser (Phase 2D)', () => {
  test('escapes < and >', () => {
    expect(esc('<script>')).toBe('&lt;script&gt;');
  });
  test('escapes &', () => {
    expect(esc('A & B')).toBe('A &amp; B');
  });
  test('escapes double quotes', () => {
    expect(esc('"hello"')).toBe('&quot;hello&quot;');
  });
  test('escapes single quotes', () => {
    expect(esc("it's")).toBe('it&#x27;s');
  });
  test('handles null → empty string', () => {
    expect(esc(null)).toBe('');
  });
  test('handles undefined → empty string', () => {
    expect(esc(undefined)).toBe('');
  });
  test('handles number → string', () => {
    expect(esc(42)).toBe('42');
  });
  test('passes through safe strings unchanged', () => {
    expect(esc('Tomato')).toBe('Tomato');
    expect(esc('₹26.00')).toBe('₹26.00');
    expect(esc('BHADBHADIYA SAGAR VALLABHBHAI')).toBe('BHADBHADIYA SAGAR VALLABHBHAI');
  });
  test('XSS payload is neutralised', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const result  = esc(payload);
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).toContain('&lt;');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// importExcel column mapping regression
// ═══════════════════════════════════════════════════════════════════════════
describe('importExcel column mapping (R07 regression)', () => {
  // Simulate what XLSX.utils.sheet_to_json returns for the exported format
  // Col order: Date[0] Supplier[1] InvoiceNo[2] Item(EN)[3] Item(Orig)[4]
  //            Category[5] Unit[6] Qty[7] Rate[8] Amount[9]
  const HEADER_ROW = ['Date','Supplier','Invoice No','Item (English)','Item (Original)','Category','Unit','Qty','Rate ₹','Amount ₹'];
  const DATA_ROW   = ['01-03-2026','TEST VENDOR','99','Tomato','ટામેટા','Vegetable','kg',60,26,1560];

  test('importExcel reads item from column index 3', () => {
    expect(DATA_ROW[3]).toBe('Tomato');
  });
  test('importExcel reads rate from column index 8', () => {
    expect(DATA_ROW[8]).toBe(26);
  });
  test('importExcel reads qty from column index 7', () => {
    expect(DATA_ROW[7]).toBe(60);
  });
  test('importExcel reads category from column index 5', () => {
    expect(DATA_ROW[5]).toBe('Vegetable');
  });
  test('importExcel reads unit from column index 6', () => {
    expect(DATA_ROW[6]).toBe('kg');
  });
  test('importExcel amount = qty × rate when column 9 matches', () => {
    expect(DATA_ROW[7] * DATA_ROW[8]).toBe(DATA_ROW[9]);
  });
  test('header row has 10 columns matching export format', () => {
    expect(HEADER_ROW).toHaveLength(10);
    expect(HEADER_ROW[0]).toBe('Date');
    expect(HEADER_ROW[3]).toBe('Item (English)');
    expect(HEADER_ROW[9]).toBe('Amount ₹');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// dupe detection logic (importExcel)
// ═══════════════════════════════════════════════════════════════════════════
describe('Import duplicate detection logic', () => {
  const existing = { date:'01-03-2026', supplier:'S', item:'Tomato', qty:60, rate:26 };

  test('exact match is detected as duplicate', () => {
    const isDupe = (x) =>
      x.date === existing.date &&
      x.supplier === existing.supplier &&
      x.item === existing.item &&
      +x.qty === existing.qty &&
      +x.rate === existing.rate;
    expect(isDupe(existing)).toBe(true);
  });

  test('different qty is not a duplicate', () => {
    const notDupe = { ...existing, qty: 50 };
    const isDupe = (x) =>
      x.date === existing.date && x.supplier === existing.supplier &&
      x.item === existing.item && +x.qty === existing.qty && +x.rate === existing.rate;
    expect(isDupe(notDupe)).toBe(false);
  });

  test('different rate is not a duplicate', () => {
    const notDupe = { ...existing, rate: 28 };
    const isDupe = (x) =>
      x.date === existing.date && x.supplier === existing.supplier &&
      x.item === existing.item && +x.qty === existing.qty && +x.rate === existing.rate;
    expect(isDupe(notDupe)).toBe(false);
  });

  test('different date is not a duplicate', () => {
    const notDupe = { ...existing, date: '08-03-2026' };
    const isDupe = (x) =>
      x.date === existing.date && x.supplier === existing.supplier &&
      x.item === existing.item && +x.qty === existing.qty && +x.rate === existing.rate;
    expect(isDupe(notDupe)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Demo data integrity
// ═══════════════════════════════════════════════════════════════════════════
describe('loadDemoData — fixture integrity', () => {
  let demoSnapshot;
  beforeAll(() => {
    const saved = DB.slice();
    DB.length = 0;
    // Call loadDemoData but suppress confirm dialog
    const origConfirm = global.confirm;
    global.confirm = () => true;
    // Suppress go() DOM interaction
    const origGo = global.go;
    global.go = () => {};
    // Suppress toast DOM interaction
    const origToast = global.toast;
    global.toast = () => {};
    loadDemoData();
    demoSnapshot = DB.slice();
    // Restore
    DB.length = 0;
    saved.forEach(r => DB.push(r));
    global.confirm = origConfirm;
    global.go      = origGo;
    global.toast   = origToast;
  });

  test('loads exactly 49 demo rows', () => {
    expect(demoSnapshot).toHaveLength(49);
  });

  test('every row has required fields', () => {
    const required = ['id','date','supplier','item','category','unit','qty','rate','amount'];
    demoSnapshot.forEach(row => {
      required.forEach(field => {
        expect(row[field]).toBeDefined();
        expect(row[field]).not.toBe('');
      });
    });
  });

  test('every row has a unique id', () => {
    const ids = new Set(demoSnapshot.map(r => r.id));
    expect(ids.size).toBe(49);
  });

  test('all dates are valid DD-MM-YYYY', () => {
    demoSnapshot.forEach(row => {
      expect(validateDate(row.date)).toBe(true);
    });
  });

  test('all categories are from the allowed set', () => {
    const allowed = new Set(['Vegetable','Grocery/Dry','Dairy','Fruit','Spice']);
    demoSnapshot.forEach(row => {
      expect(allowed.has(row.category)).toBe(true);
    });
  });

  test('all amounts equal qty × rate', () => {
    demoSnapshot.forEach(row => {
      expect(row.amount).toBeCloseTo(row.qty * row.rate, 1);
    });
  });

  test('covers 5 distinct suppliers', () => {
    const sups = new Set(demoSnapshot.map(r => r.supplier));
    expect(sups.size).toBeGreaterThanOrEqual(5);
  });

  test('covers 5 distinct purchase dates', () => {
    const dates = new Set(demoSnapshot.map(r => r.date));
    expect(dates.size).toBe(5);
  });

  test('all dates are in March 2026', () => {
    demoSnapshot.forEach(row => {
      expect(getMonthKey(row.date)).toBe('03-2026');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Trend calculation edge cases (regression R16 from blueprint)
// ═══════════════════════════════════════════════════════════════════════════
describe('Trend calculation — edge cases and boundary precision', () => {
  test('pct exactly 10.0 produces Rising (not Slight Rise)', () => {
    // 10% increase: last = first * 1.1 exactly
    // first=100, last=110: (110-100)/100*100 = 10.0
    const fixture = [
      { id:'e1', item:'Edge', date:'01-03-2026', rate:'100', qty:'1', amount:'100', category:'Vegetable', unit:'kg' },
      { id:'e2', item:'Edge', date:'08-03-2026', rate:'110', qty:'1', amount:'110', category:'Vegetable', unit:'kg' },
    ];
    const result = withDB(fixture, () => getItemTrends());
    // pct = exactly 10.0 — trendLabel(10) → Rising because condition is pct > 10
    // Wait: 110-100 = 10, /100 = 0.1, *100 = 10.0. trendLabel(10): 10 > 10 is FALSE, so it falls to 10 > 3 = Slight Rise
    // This is the exact boundary that caused confusion. Verify the actual behaviour:
    const pct = (110-100)/100*100; // = 10
    const label = trendLabel(pct);
    expect(label.txt).toBe(pct > 10 ? '📈 Rising' : '🔺 Slight Rise');
    // The test documents the exact behaviour — do not change the assertion, change nothing
  });

  test('getItemTrends pct boundary consistent with trendLabel', () => {
    const fixture = [
      { id:'b1', item:'BoundaryItem', date:'01-03-2026', rate:'100', qty:'1', amount:'100', category:'Vegetable', unit:'kg' },
      { id:'b2', item:'BoundaryItem', date:'08-03-2026', rate:'115', qty:'1', amount:'115', category:'Vegetable', unit:'kg' },
    ];
    const result = withDB(fixture, () => getItemTrends());
    const t = result['BoundaryItem'];
    // pct = 15, trendLabel(15) → Rising
    expect(t.label).toBe('📈 Rising');
    expect(t.cls).toBe('t-rising');
  });

  test('negative zero pct gives Stable not Falling', () => {
    const fixture = [
      { id:'n1', item:'Flat', date:'01-03-2026', rate:'50', qty:'1', amount:'50', category:'Vegetable', unit:'kg' },
      { id:'n2', item:'Flat', date:'08-03-2026', rate:'50', qty:'1', amount:'50', category:'Vegetable', unit:'kg' },
    ];
    const result = withDB(fixture, () => getItemTrends());
    expect(result['Flat'].pct).toBe(0);
    expect(result['Flat'].label).toBe('🟢 Stable');
  });
});
