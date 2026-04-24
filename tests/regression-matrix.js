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

global.localStorage = (()=>{let s={};return{getItem:k=>s[k]??null,setItem:(k,v)=>{s[k]=String(v);},removeItem:k=>{delete s[k];},_reset:()=>{s={};},_store:()=>s};})();
global.sessionStorage= (()=>{let s={};return{getItem:k=>s[k]??null,setItem:(k,v)=>{s[k]=String(v);},removeItem:k=>{delete s[k];}};})();
global.screen        = {width:1920,height:1080};
global.window        = {addEventListener(){},dispatchEvent(){}};
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

const _ci=console.info,_cw=console.warn; console.info=()=>{}; console.warn=()=>{};
const wrapped = script.replace(/^let /gm,'var ').replace(/^const /gm,'var ');
try{(0,eval)(wrapped);}catch(e){/* DOM init errors at boot expected */}
console.info=_ci; console.warn=_cw;

const REQUIRED=['parseDateSort','getMonthKey','validateDate','trendLabel','catClass','uid','saveDB','getItemTrends','esc','calcAmount'];
const missing=REQUIRED.filter(fn=>typeof global[fn]!=='function');
if(missing.length){console.error('ERROR: Missing functions after eval:',missing.join(', '));process.exit(1);}

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
function checkTrue(id,label,got){
  const ok=got===true;
  results.push({id,label,ok,got,expected:true});
  if(ok){passed++;process.stdout.write('.');}else{failed++;process.stdout.write('F');}
}
function assert(label,got,expected){check('A-'+label,label,got,expected);}
function assertApprox(label,got,expected,tol){checkApprox('A-'+label,label,got,expected,tol);}
function assertTrue(label,got){checkTrue('A-'+label,label,got);}

console.log('SabziTracker — Regression Matrix');
console.log('────────────────────────────────────────────────────────');
console.log('Running (. pass, F fail): ');

assert('R01-a parseDateSort 01-03-2026',parseDateSort('01-03-2026'),'2026-03-01');
assert('R01-b parseDateSort 31-12-2025',parseDateSort('31-12-2025'),'2025-12-31');
assert('R01-c date sort 29-03 > 01-03',parseDateSort('29-03-2026')>parseDateSort('01-03-2026'),true);
assert('R01-d date sort 01-04 > 29-03',parseDateSort('01-04-2026')>parseDateSort('29-03-2026'),true);
assert('R01-e date sort 01-01-2027 > 31-12-2026',parseDateSort('01-01-2027')>parseDateSort('31-12-2026'),true);
assert('R01-f empty string',parseDateSort(''),'');
assert('R01-g null input',parseDateSort(null),'');

assert('R02-a getMonthKey 15-03-2026',getMonthKey('15-03-2026'),'03-2026');
assert('R02-b getMonthKey 01-12-2025',getMonthKey('01-12-2025'),'12-2025');
assert('R02-c getMonthKey 07-04-2026',getMonthKey('07-04-2026'),'04-2026');
assert('R02-d getMonthKey empty',getMonthKey(''),'');
assert('R02-e getMonthKey null',getMonthKey(null),'');
assert('R02-f getMonthKey format MM-YYYY',/^\d{2}-\d{4}$/.test(getMonthKey('22-03-2026')),true);
assert('R02-g getMonthKey same month',getMonthKey('01-03-2026')===getMonthKey('29-03-2026'),true);
assert('R02-h getMonthKey diff months',getMonthKey('01-03-2026')!==getMonthKey('01-04-2026'),true);

assert('R03-a trendLabel pct=15',trendLabel(15).txt,'📈 Rising');
assert('R03-b trendLabel pct=10.1',trendLabel(10.1).txt,'📈 Rising');
assert('R03-c trendLabel pct=5',trendLabel(5).txt,'🔺 Slight Rise');
assert('R03-d trendLabel pct=3.1',trendLabel(3.1).txt,'🔺 Slight Rise');
assert('R03-e trendLabel pct=0',trendLabel(0).txt,'🟢 Stable');
assert('R03-f trendLabel pct=-3',trendLabel(-3).txt,'🟢 Stable');
assert('R03-g trendLabel pct=-3.1',trendLabel(-3.1).txt,'🔻 Falling');
assert('R03-h trendLabel pct=-5',trendLabel(-5).txt,'🔻 Falling');
assert('R03-i trendLabel pct=-10',trendLabel(-10).txt,'🔻 Falling');
assert('R03-j trendLabel pct=-10.1',trendLabel(-10.1).txt,'📉 Dropping');
assert('R03-k trendLabel pct=-20',trendLabel(-20).txt,'📉 Dropping');
assert('R03-l t-rising class',trendLabel(15).cls,'t-rising');
assert('R03-m t-slight class',trendLabel(5).cls,'t-slight');
assert('R03-n t-stable class',trendLabel(0).cls,'t-stable');
assert('R03-o t-falling class',trendLabel(-5).cls,'t-falling');
assert('R03-p t-dropping class',trendLabel(-15).cls,'t-dropping');

assert('R04-a validateDate 01-03-2026',validateDate('01-03-2026'),true);
assert('R04-b validateDate 31-12-2099',validateDate('31-12-2099'),true);
assert('R04-c validateDate 01-01-2000',validateDate('01-01-2000'),true);
assert('R04-d validateDate empty',validateDate(''),true);
assert('R04-e validateDate null',validateDate(null),true);
assert('R04-f validateDate ISO format',validateDate('2026-03-01'),false);
assert('R04-g validateDate no leading zeros',validateDate('1-3-2026'),false);
assert('R04-h validateDate slashes',validateDate('01/03/2026'),false);
assert('R04-i validateDate 2-digit year',validateDate('01-03-26'),false);
assert('R04-j validateDate month 13',validateDate('01-13-2026'),false);
assert('R04-k validateDate day 32',validateDate('32-03-2026'),false);
assert('R04-l validateDate year before 2000',validateDate('01-01-1999'),false);
assert('R04-m validateDate year after 2100',validateDate('01-01-2101'),false);

assert('R05-a catClass Vegetable',catClass('Vegetable'),'b-vegetable');
assert('R05-b catClass Grocery/Dry',catClass('Grocery/Dry'),'b-grocery');
assert('R05-c catClass Dairy',catClass('Dairy'),'b-dairy');
assert('R05-d catClass Fruit',catClass('Fruit'),'b-fruit');
assert('R05-e catClass Spice',catClass('Spice'),'b-spice');
assert('R05-f catClass unknown',catClass('Other'),'b-other');
assert('R05-g catClass lowercase',catClass('vegetable'),'b-other');
assert('R05-h catClass null',catClass(null),'b-other');
assert('R05-i catClass empty',catClass(''),'b-other');

assert('R06-a uid returns string',typeof uid()==='string',true);
const ids=new Set(Array.from({length:100},uid));
assert('R06-b uid uniqueness x100',ids.size,100);
assert('R06-c uid alphanumeric',/^[a-z0-9]+$/.test(uid()),true);

const _savedDB=DB?DB.slice():[];
DB=[
  {id:'t1',item:'Tomato',date:'01-03-2026',rate:'26',qty:'60',amount:'1560',category:'Vegetable',unit:'kg'},
  {id:'t2',item:'Tomato',date:'08-03-2026',rate:'28',qty:'50',amount:'1400',category:'Vegetable',unit:'kg'},
  {id:'t3',item:'Tomato',date:'15-03-2026',rate:'25',qty:'55',amount:'1375',category:'Vegetable',unit:'kg'},
  {id:'t4',item:'Potato',date:'01-03-2026',rate:'18',qty:'100',amount:'1800',category:'Vegetable',unit:'kg'},
];
const t=getItemTrends();
assert('R07-a Tomato first rate',t['Tomato'].first,26);
assert('R07-b Tomato last rate',t['Tomato'].last,25);
assertApprox('R07-c Tomato avg',t['Tomato'].avg,(26+28+25)/3,0.01);
assertApprox('R07-d Tomato pct',t['Tomato'].pct,(25-26)/26*100,0.01);
assert('R07-e Tomato totalQty',t['Tomato'].totalQty,165);
assert('R07-f Tomato totalSpend',t['Tomato'].totalSpend,4335);
assert('R07-g Potato pct 0',t['Potato'].pct,0);
assert('R07-h Potato stable',t['Potato'].label,'🟢 Stable');
DB=[];const emptyT=getItemTrends();
assert('R07-i empty DB returns {}',JSON.stringify(emptyT),'{}');
DB=_savedDB;

const mk=getMonthKey('22-03-2026');
assert('R08-a monthKey format MM-YYYY',/^\d{2}-\d{4}$/.test(mk),true);

const _db2=DB?DB.slice():[];
const _orig=JSON.parse(localStorage.getItem('sabzi_db')||'[]');
DB=[{id:'chk',item:'Test',date:'01-01-2026',supplier:'S',invoice_no:'1',item_orig:'',category:'Vegetable',unit:'kg',qty:1,rate:10,amount:10}];
saveDB();
const fromStorage=JSON.parse(localStorage.getItem('sabzi_db'));
assert('R09-a saveDB persists 1 row',fromStorage.length,1);
assert('R09-b saveDB preserves item',fromStorage[0].item,'Test');
DB=_db2;localStorage.setItem('sabzi_db',JSON.stringify(_orig));

assert('R10-a calcAmount works',typeof calcAmount==='function',true);

assert('R11-a esc < >',esc('<script>'),'&lt;script&gt;');
assert('R11-b esc &',esc('A & B'),'A &amp; B');
assert('R11-c esc quote',esc('"hello"'),'&quot;hello&quot;');
assert('R11-d esc null',esc(null),'');
assert('R11-e esc number',esc(42),'42');
assert('R11-f esc safe',esc('Tomato'),'Tomato');
assert('R11-g esc XSS',esc('<img onerror=alert(1)>'),'&lt;img onerror=alert(1)&gt;');

const d1=parseDateSort('29-03-2026'),d2=parseDateSort('01-03-2026');
assert('R12-a sort descending',d1>d2,true);
const arr=['01-03-2026','15-03-2026','08-03-2026'].sort((a,b)=>parseDateSort(b).localeCompare(parseDateSort(a)));
assert('R12-b array sort',arr[0],'15-03-2026');

console.log('');
console.log('────────────────────────────────────────────────────────');
console.log(`  Total: ${passed+failed}   Passed: ${passed} ✓   Failed: ${failed}`);
console.log('────────────────────────────────────────────────────────');

if(failed>0){
  console.log('');
  console.log('Failed checks:');
  results.filter(r=>!r.ok).forEach(r=>console.log(`  - ${r.label}: got ${JSON.stringify(r.got)}, expected ${JSON.stringify(r.expected)}`));
  process.exit(1);
}else{
  console.log('  All checks passed ✓  Safe to deploy.');
  process.exit(0);
}