#!/usr/bin/env node
/**
 * regression-matrix.js — SabziTracker Production Regression Matrix
 * Standalone runner. No Jest or Playwright required.
 * Usage:  node tests/regression-matrix.js
 * Exit 0 = all pass. Exit 1 = failures.
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const HTML_PATH = path.resolve(__dirname, '..', 'SabziTracker_Production.html');
if (!fs.existsSync(HTML_PATH)) {
  console.error('ERROR: SabziTracker_Production.html not found at:', HTML_PATH);
  process.exit(1);
}

const html        = fs.readFileSync(HTML_PATH, 'utf8');
const scriptStart = html.indexOf('<script>') + '<script>'.length;
const scriptEnd   = html.lastIndexOf('</script>');
const script      = html.slice(scriptStart, scriptEnd).trim();

// ── Browser stubs ──────────────────────────────────────────────────────────
global.localStorage = (()=>{let s={};return{getItem:k=>s[k]??null,setItem:(k,v)=>{s[k]=String(v);},removeItem:k=>{delete s[k];},_reset:()=>{s={};},_store:()=>s};})();
global.sessionStorage= (()=>{let s={};return{getItem:k=>s[k]??null,setItem:(k,v)=>{s[k]=String(v);},removeItem:k=>{delete s[k];}};})();
global.screen        = {width:1920,height:1080};
global.window        = {addEventListener(){},dispatchEvent(){},_trendsCache:null,_trendsCacheLen:-1};
// Element value store — allows calcAmount() tests to track field values
const _vals = {};
function makeEl(id){
  return {
    _id:id||'',
    get value(){return _vals[id]!==undefined?_vals[id]:'';},
    set value(v){_vals[id]=v;},
    textContent:'',style:{display:''},innerHTML:'',
    classList:{add(){},remove(){},contains(){return false;}},
    addEventListener(){},querySelector(){return makeEl('_child');},
    querySelectorAll(){return [];},appendChild(){},remove(){},
    parentElement:{querySelector(){return null;},querySelectorAll(){return[];},appendChild(){}},
    getContext(){return{canvas:{},fillRect(){},clearRect(){},drawImage(){}};},
  };
}
global.document = {
  getElementById:(id)=>makeEl(id),querySelectorAll:()=>[],
  addEventListener:()=>{},createTreeWalker:()=>({nextNode:()=>null}),
  createElement:(t)=>Object.assign(makeEl('_new'),{tagName:t}),
  body:{appendChild(){}},fonts:[]
};
global.NodeFilter       = {SHOW_TEXT:4};
global.MutationObserver = class{observe(){}};
global.Chart            = class{constructor(){}destroy(){}};
global.XLSX             = {utils:{book_new:()=>({}),aoa_to_sheet:()=>({}),book_append_sheet(){},sheet_to_json:()=>[]},read:()=>({}),writeFile(){}};
global.Blob             = class{constructor(p){this.size=p.reduce((s,x)=>s+String(x).length,0);}};
global.URL              = {createObjectURL:()=>'',revokeObjectURL:()=>{}};
global.confirm          = ()=>true;
try{Object.defineProperty(global,'navigator',{value:{userAgent:'node-regression-runner',onLine:true},writable:true,configurable:true});}catch(e){}

// ── Load app ─────────────────────────────────────────────────────────────────
// Replace let/const with var so indirect eval places them on global
const _ci=console.info,_cw=console.warn; console.info=()=>{}; console.warn=()=>{};
const wrapped = script.replace(/^let /gm,'var ').replace(/^const /gm,'var ');
try{(0,eval)(wrapped);}catch(e){/* DOM init errors at boot expected */}
console.info=_ci; console.warn=_cw;

// Verify all required functions loaded
const REQUIRED=['parseDateSort','getMonthKey','validateDate','trendLabel','catClass','uid','saveDB','getItemTrends','esc','calcAmount'];
const missing=REQUIRED.filter(fn=>typeof global[fn]!=='function');
if(missing.length){console.error('ERROR: Missing functions after eval:',missing.join(', '));process.exit(1);}

// ── Test harness ──────────────────────────────────────────────────────────────
const results=[]; let passed=0,failed=0;
function check(id,label,got,expected){
  const ok=JSON.stringify(got)===JSON.stringify(expected);
  results.push({id,label,ok,got,expected});
  if(ok){passed++;process.stdout.write('.');}else{failed++;process.stdout.write('F');}
}
function checkApprox(id,label,got,expected,tol=0.01){
  const ok=typeof got==='number'&&Math.abs(got-expected)<=tol;
  results.push({id,label,ok,got,expected:`≈${expected.toFixed(4)}±${tol}`});
  if(ok){passed++;process.stdout.write('.');}else{failed++;process.stdout.write('F');}
}

// Save/restore DB around getItemTrends calls
function withDB(fixture){
  const saved=DB.slice(); DB.length=0; fixture.forEach(r=>DB.push(r));
  let result; try{result=getItemTrends();}finally{DB.length=0;saved.forEach(r=>DB.push(r));}
  return result;
}

const FIX=[
  {id:'t1',item:'Tomato',date:'01-03-2026',rate:'26',qty:'60',amount:'1560',category:'Vegetable',unit:'kg'},
  {id:'t2',item:'Tomato',date:'08-03-2026',rate:'28',qty:'50',amount:'1400',category:'Vegetable',unit:'kg'},
  {id:'t3',item:'Tomato',date:'15-03-2026',rate:'25',qty:'55',amount:'1375',category:'Vegetable',unit:'kg'},
  {id:'t4',item:'Potato',date:'01-03-2026',rate:'18',qty:'100',amount:'1800',category:'Vegetable',unit:'kg'},
  {id:'t5',item:'Onion', date:'29-03-2026',rate:'40',qty:'10',amount:'400', category:'Vegetable',unit:'kg'},
  {id:'t6',item:'Onion', date:'01-03-2026',rate:'30',qty:'10',amount:'300', category:'Vegetable',unit:'kg'},
];

console.log('\nSabziTracker — Regression Matrix');
console.log('─'.repeat(56));
process.stdout.write('Running (. pass, F fail): ');

// R01 parseDateSort
check('R01-a','parseDateSort 01-03-2026',parseDateSort('01-03-2026'),'2026-03-01');
check('R01-b','parseDateSort 31-12-2025',parseDateSort('31-12-2025'),'2025-12-31');
check('R01-c','parseDateSort empty',parseDateSort(''),'');
check('R01-d','parseDateSort null',parseDateSort(null),'');
check('R01-e','later date sorts greater (same month)',parseDateSort('29-03-2026')>parseDateSort('01-03-2026'),true);
check('R01-f','cross-month sort correct',parseDateSort('01-04-2026')>parseDateSort('29-03-2026'),true);
check('R01-g','cross-year sort correct',parseDateSort('01-01-2027')>parseDateSort('31-12-2026'),true);

// R02 getMonthKey
check('R02-a','getMonthKey 15-03-2026',getMonthKey('15-03-2026'),'03-2026');
check('R02-b','getMonthKey 01-12-2025',getMonthKey('01-12-2025'),'12-2025');
check('R02-c','getMonthKey empty',getMonthKey(''),'');
check('R02-d','getMonthKey null',getMonthKey(null),'');
check('R02-e','output format MM-YYYY',/^\d{2}-\d{4}$/.test(getMonthKey('22-03-2026')),true);
check('R02-f','same month same key',getMonthKey('01-03-2026')===getMonthKey('29-03-2026'),true);
check('R02-g','different months differ',getMonthKey('01-03-2026')===getMonthKey('01-04-2026'),false);

// R03 trendLabel (strict inequalities — 10 is NOT > 10)
check('R03-a','trendLabel(15)→Rising',      trendLabel(15).txt,'📈 Rising');
check('R03-b','trendLabel(5)→Slight Rise',  trendLabel(5).txt, '🔺 Slight Rise');
check('R03-c','trendLabel(0)→Stable',       trendLabel(0).txt, '🟢 Stable');
check('R03-d','trendLabel(2)→Stable',       trendLabel(2).txt, '🟢 Stable');
check('R03-e','trendLabel(-5)→Falling',     trendLabel(-5).txt,'🔻 Falling');
check('R03-f','trendLabel(-15)→Dropping',   trendLabel(-15).txt,'📉 Dropping');
check('R03-g','trendLabel(10)→Slight Rise (10 NOT >10)',trendLabel(10).txt,'🔺 Slight Rise');
check('R03-h','trendLabel(10.001)→Rising',  trendLabel(10.001).txt,'📈 Rising');
check('R03-i','trendLabel(3)→Stable (3 NOT >3)',trendLabel(3).txt,'🟢 Stable');
check('R03-j','trendLabel(3.001)→Slight Rise',trendLabel(3.001).txt,'🔺 Slight Rise');
check('R03-k','trendLabel(-10)→Falling (-10 NOT <-10)',trendLabel(-10).txt,'🔻 Falling');
check('R03-l','trendLabel(-10.001)→Dropping',trendLabel(-10.001).txt,'📉 Dropping');
check('R03-m','cls Rising',  trendLabel(15).cls,  't-rising');
check('R03-n','cls Slight',  trendLabel(5).cls,   't-slight');
check('R03-o','cls Stable',  trendLabel(0).cls,   't-stable');
check('R03-p','cls Falling', trendLabel(-5).cls,  't-falling');
check('R03-q','cls Dropping',trendLabel(-15).cls, 't-dropping');

// R04 validateDate
check('R04-a','valid date',   validateDate('01-03-2026'),true);
check('R04-b','valid max yr', validateDate('31-12-2099'),true);
check('R04-c','empty allowed',validateDate(''),true);
check('R04-d','null allowed', validateDate(null),true);
check('R04-e','month 13',     validateDate('01-13-2026'),false);
check('R04-f','month 00',     validateDate('01-00-2026'),false);
check('R04-g','day 32',       validateDate('32-03-2026'),false);
check('R04-h','day 00',       validateDate('00-03-2026'),false);
check('R04-i','ISO format',   validateDate('2026-03-01'),false);
check('R04-j','no padding',   validateDate('1-3-2026'),  false);
check('R04-k','yr 1999',      validateDate('01-01-1999'),false);
check('R04-l','yr 2101',      validateDate('01-01-2101'),false);
check('R04-m','non-numeric',  validateDate('ab-cd-efgh'),false);

// R05 catClass
check('R05-a','Vegetable',   catClass('Vegetable'),  'b-vegetable');
check('R05-b','Grocery/Dry', catClass('Grocery/Dry'),'b-grocery');
check('R05-c','Dairy',       catClass('Dairy'),      'b-dairy');
check('R05-d','Fruit',       catClass('Fruit'),      'b-fruit');
check('R05-e','Spice',       catClass('Spice'),      'b-spice');
check('R05-f','unknown',     catClass('Unknown'),    'b-other');
check('R05-g','empty',       catClass(''),           'b-other');
check('R05-h','null',        catClass(null),         'b-other');
check('R05-i','case-sensitive (lowercase→other)',catClass('vegetable'),'b-other');

// R06 uid
check('R06-a','returns string',typeof uid(),'string');
check('R06-b','non-empty',uid().length>0,true);
check('R06-c','alphanumeric only',/^[a-z0-9]+$/.test(uid()),true);
check('R06-d','unique x2000',new Set(Array.from({length:2000},uid)).size,2000);

// R07 getItemTrends
const T=withDB(FIX);
check('R07-a','Tomato first=26',     T.Tomato.first,      26);
check('R07-b','Tomato last=25',      T.Tomato.last,       25);
checkApprox('R07-c','Tomato avg',    T.Tomato.avg,        (26+28+25)/3);
checkApprox('R07-d','Tomato pct',    T.Tomato.pct,        (25-26)/26*100);
check('R07-e','Tomato label=Falling',T.Tomato.label,      '🔻 Falling');
check('R07-f','Tomato totalQty=165', T.Tomato.totalQty,   165);
check('R07-g','Tomato totalSpend=4335',T.Tomato.totalSpend,4335);
check('R07-h','Potato pct=0',        T.Potato.pct,        0);
check('R07-i','Potato label=Stable', T.Potato.label,      '🟢 Stable');
check('R07-j','Onion first=30 (sorted by date not insertion)',T.Onion.first,30);
check('R07-k','Onion last=40',       T.Onion.last,        40);
check('R07-l','Onion label=Rising',  T.Onion.label,       '📈 Rising');
check('R07-m','empty DB→{}',         JSON.stringify(withDB([])),'{}');
const SR=withDB([{id:'s1',item:'Garlic',date:'01-03-2026',rate:'120',qty:'2',amount:'240',category:'Vegetable',unit:'kg'}]);
check('R07-n','string rate coerced to number',typeof SR.Garlic.first,'number');
check('R07-o','string rate value correct',    SR.Garlic.first,120);
const ZR=withDB([{id:'z1',item:'Free',date:'01-03-2026',rate:'0',qty:'10',amount:'0',category:'Vegetable',unit:'kg'}]);
check('R07-p','zero rate: pct=0 no crash',    ZR.Free.pct,0);

// R08 month filter pipeline
const mf=[{id:'m1',date:'01-03-2026'},{id:'m2',date:'29-03-2026'},{id:'m3',date:'01-04-2026'}];
const march=mf.filter(r=>getMonthKey(r.date)==='03-2026');
check('R08-a','filter isolates March',        march.length,2);
check('R08-b','filter excludes April',        march.some(r=>r.id==='m3'),false);

// R09 saveDB round-trip
(()=>{
  const saved=DB.slice(); DB.length=0;
  DB.push({id:'r9',item:'R9Item',date:'01-04-2026',supplier:'S',invoice_no:'9',item_orig:'',category:'Vegetable',unit:'kg',qty:5,rate:30,amount:150});
  saveDB();
  const stored=JSON.parse(localStorage.getItem('sabzi_db'));
  check('R09-a','persists to sabzi_db',     stored.length,1);
  check('R09-b','correct item name',        stored[0].item,'R9Item');
  check('R09-c','correct rate',             stored[0].rate,30);
  check('R09-d','valid JSON array',         Array.isArray(stored),true);
  // Overwrite
  DB.length=0; DB.push({id:'r9b',item:'R9B',date:'02-04-2026',supplier:'',invoice_no:'',item_orig:'',category:'Vegetable',unit:'kg',qty:1,rate:1,amount:1});
  saveDB();
  const s2=JSON.parse(localStorage.getItem('sabzi_db'));
  check('R09-e','overwrites previous',      s2.length,1);
  check('R09-f','new value correct',        s2[0].item,'R9B');
  DB.length=0; saved.forEach(r=>DB.push(r)); localStorage._reset();
})();

// R10 calcAmount
(()=>{
  _vals['m-qty']='10'; _vals['m-rate']='26'; _vals['m-amt']=''; calcAmount();
  check('R10-a','10×26=260.00',             _vals['m-amt'],'260.00');
  _vals['m-qty']='3';  _vals['m-rate']='80'; _vals['m-amt']=''; calcAmount();
  check('R10-b','3×80=240.00',              _vals['m-amt'],'240.00');
  _vals['m-qty']='0.5';_vals['m-rate']='100';_vals['m-amt']=''; calcAmount();
  check('R10-c','0.5×100=50.00',            _vals['m-amt'],'50.00');
  _vals['m-qty']='0';  _vals['m-rate']='50'; _vals['m-amt']='PREV'; calcAmount();
  check('R10-d','qty=0 does not overwrite', _vals['m-amt'],'PREV');
})();

// R11 esc()
check('R11-a','esc: < → &lt;',   esc('<'),        '&lt;');
check('R11-b','esc: > → &gt;',   esc('>'),        '&gt;');
check('R11-c','esc: & → &amp;',  esc('&'),        '&amp;');
check('R11-d','esc: " → &quot;', esc('"'),        '&quot;');
check('R11-e',"esc: ' → &#x27;", esc("'"),        '&#x27;');
check('R11-f','esc: null → ""',  esc(null),       '');
check('R11-g','esc: number',     esc(42),         '42');
check('R11-h','esc: safe string',esc('Tomato'),   'Tomato');
check('R11-i','esc: no raw <',   esc('<script>').includes('<'),false);

// R12 sort correctness
const unsorted=['29-03-2026','01-03-2026','15-03-2026','08-03-2026'];
const sorted=unsorted.slice().sort((a,b)=>parseDateSort(a).localeCompare(parseDateSort(b)));
check('R12-a','sort: first=01-03',sorted[0],'01-03-2026');
check('R12-b','sort: last=29-03', sorted[sorted.length-1],'29-03-2026');

// ── Results ───────────────────────────────────────────────────────────────────
const total=passed+failed;
console.log('\n');
console.log('─'.repeat(56));
console.log(`  Total: ${total}   Passed: ${passed} ✓   Failed: ${failed}${failed>0?' ✗':''}`);
console.log('─'.repeat(56));
if(failed>0){
  console.log('\n  FAILURES:\n');
  results.filter(r=>!r.ok).forEach(r=>{
    console.log(`  [${r.id}] ${r.label}`);
    console.log(`    Expected: ${JSON.stringify(r.expected)}`);
    console.log(`    Got:      ${JSON.stringify(r.got)}\n`);
  });
  console.log('  ⚠  Do not deploy — check that no original logic was modified.\n');
  process.exit(1);
}else{
  console.log(`\n  All ${total} checks passed ✓  Safe to deploy.\n`);
  process.exit(0);
}
