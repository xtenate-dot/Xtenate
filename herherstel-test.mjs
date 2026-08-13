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

// herstelde stand: juiste datums, juiste soorten, priveSt 2187.38
const bron=fs.readFileSync(bestand('storage.js'),'utf8');
const DEF=JSON.parse(bron.match(/export const HIST_TX_DEFAULT = (\[[\s\S]*?\]);\n/)[1]);
localStorage.setItem('xtenate_hist_tx_override',JSON.stringify(DEF.map((t,i)=>({...t,id:'h'+t.datum.slice(0,4)+'_'+(500+i)}))));
localStorage.setItem('xtenate_home_totals_override',JSON.stringify({'2022':{priveOp:250,priveSt:2187.38}}));
localStorage.setItem('xtenate_tx',JSON.stringify([]));
const snapshot=JSON.stringify({...localStorage});

const U=await laad('uitvoeren.js?v=20260812c');
const gc=await laad('gegevenscontrole.js?v=20260812c');
const p=await U.stapPreview();
ok('geen datummutaties meer', p.aantalDatums===0, String(p.aantalDatums));
ok('geen soortmutaties meer', p.aantalTypes===0, String(p.aantalTypes));
ok('geen jaartotaalmutatie meer', p.aantalWaarden===0, String(p.aantalWaarden));
let geweigerd=false;
try{ await U.stapUitvoeren(p,{x:1}); }catch(e){ geweigerd=/geen plan/.test(e.message); }
ok('opnieuw uitvoeren wordt geweigerd', geweigerd);
ok('opslag ongewijzigd', JSON.stringify({...localStorage})===snapshot);
const m=await gc.bouwMeldingen();
ok('de vier herstelde meldingen zijn verdwenen',
   !m.some(x=>x.id==='datum-verschuiving'||x.id.startsWith('soort::')||x.id==='jaartotaal::2022::priveSt'),
   m.map(x=>x.id).join(', ')||'geen meldingen');
console.log(f.length?`\n${f.length} MISLUKT: ${f.join(', ')}`:'\nalles goed');
process.exit(f.length?1:0);
