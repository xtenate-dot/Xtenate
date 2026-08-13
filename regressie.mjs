import { JSDOM } from 'jsdom'; import fs from 'fs'; import { webcrypto } from 'crypto';
import { fileURLToPath } from 'url'; import path from 'path';
// Paden vanuit dit bestand, niet vanuit de werkmap. `fs` las cwd-relatief en
// `import()` bestandsrelatief, waardoor de test alleen leek te werken.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bestand = n => path.join(ROOT, n);
const laad = n => import(new URL('../' + n, import.meta.url).href);
const dom=new JSDOM(fs.readFileSync(bestand('index.html'),'utf8'),{url:'https://x.test/'});
const {window}=dom; class C{constructor(c){if(!c)throw new Error('x');}destroy(){}}
global.window=window; global.document=window.document;
Object.defineProperty(global,'navigator',{value:window.navigator,configurable:true});
Object.defineProperty(window,'crypto',{value:webcrypto,configurable:true});
global.localStorage=window.localStorage; global.Chart=C; window.Chart=C; global.Blob=window.Blob;
global.getComputedStyle=window.getComputedStyle.bind(window);
window.matchMedia=()=>({matches:false,addEventListener(){},addListener(){}});
global.matchMedia=window.matchMedia; window.scrollTo=()=>{};
global.XLSX={}; window.XLSX={}; global.atob=window.atob.bind(window);
window.URL.createObjectURL=()=>'blob:t'; window.URL.revokeObjectURL=()=>{}; global.URL=window.URL;
window.HTMLAnchorElement.prototype.click=function(){};
const f=[]; const ok=(n,c,e='')=>{console.log(`${c?'✓':'✗'} ${n}${e?' — '+e:''}`); if(!c)f.push(n);};
const bron=fs.readFileSync(bestand('storage.js'),'utf8');
const DEF=JSON.parse(bron.match(/export const HIST_TX_DEFAULT = (\[[\s\S]*?\]);\n/)[1]);
const sh=(d,n)=>{const x=new Date(d+'T00:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);};
// de oude, onherstelde stand
const hist=DEF.map((t,i)=>{const u={...t,datum:sh(t.datum,-1),id:'h'+t.datum.slice(0,4)+'_'+(500+i)};
  if(t.datum==='2023-03-06'&&t.type==='prive_opname') u.type='prive_storting';
  if(t.datum==='2023-03-15'&&t.type==='prive_storting') u.type='prive_opname';
  return u;});
localStorage.setItem('xtenate_hist_tx_override',JSON.stringify(hist));
localStorage.setItem('xtenate_home_totals_override',JSON.stringify({'2022':{priveOp:250,priveSt:2023.06}}));
localStorage.setItem('xtenate_tx',JSON.stringify([]));
const U=await laad('uitvoeren.js?v=20260812c');
const p=await U.stapPreview();
// De twee omgewisselde records krijgen zowel een datum- als een soortmutatie:
// 473 datums en 2 soorten, samen 475 mutaties op 473 records.
ok('473 datummutaties', p.aantalDatums===473, String(p.aantalDatums));
ok('475 mutaties op 473 records',
   p.mutaties.filter(m=>m.sleutel==='xtenate_hist_tx_override').length===475
   && new Set(p.mutaties.filter(m=>m.recordId).map(m=>m.recordId)).size===473,
   `${p.mutaties.length} mutaties, ${new Set(p.mutaties.filter(m=>m.recordId).map(m=>m.recordId)).size} records`);
ok('twee soortmutaties', p.aantalTypes===2, String(p.aantalTypes));
ok('één jaartotaalmutatie', p.aantalWaarden===1, String(p.aantalWaarden));
ok('elke datummutatie is exact één dag',
   p.mutaties.filter(m=>m.veld==='datum').every(m=>
     Math.round((Date.parse(m.naar)-Date.parse(m.van))/86400000)===1));
ok('jaargrensgeval herkend', p.jaargrens.length===1, JSON.stringify(p.jaargrens));
ok('alle garanties gehaald', p.garanties.every(g=>g.goed), p.garanties.filter(g=>!g.goed).map(g=>g.tekst).join(', '));
console.log(f.length?`\n${f.length} MISLUKT: ${f.join(', ')}`:'\nalles goed');
process.exit(f.length?1:0);
