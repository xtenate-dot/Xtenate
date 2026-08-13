// Test op de 2026-tak van de import. Die zette de maandsaldi wel in het
// geheugen maar schreef ze niet weg, waardoor ze bij de eerstvolgende
// herlaadbeurt verdwenen. Schrijft niets buiten een eigen, verzonnen dataset.
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'url'; import path from 'path';
// Paden vanuit dit bestand, niet vanuit de werkmap.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bestand = n => path.join(ROOT, n);
const laad = n => import(new URL('../' + n, import.meta.url).href);
import fs from 'fs'; import { webcrypto } from 'crypto';
import * as XLSX from 'xlsx';
const dom=new JSDOM(fs.readFileSync(bestand('index.html'),'utf8'),{url:'https://x.test/'});
const {window}=dom; class C{constructor(c){if(!c)throw new Error('x');}destroy(){}}
global.window=window; global.document=window.document;
Object.defineProperty(global,'navigator',{value:window.navigator,configurable:true});
Object.defineProperty(window,'crypto',{value:webcrypto,configurable:true});
global.localStorage=window.localStorage; global.Chart=C; window.Chart=C; global.Blob=window.Blob;
global.getComputedStyle=window.getComputedStyle.bind(window);
window.matchMedia=()=>({matches:false,addEventListener(){},addListener(){}});
global.matchMedia=window.matchMedia; window.scrollTo=()=>{};
global.XLSX=XLSX; window.XLSX=XLSX; global.atob=window.atob.bind(window);
global.FileReader=window.FileReader; global.URL=window.URL;
const f=[]; const ok=(n,c,e='')=>{console.log(`${c?'✓':'✗'} ${n}${e?' — '+e:''}`); if(!c)f.push(n);};

// ---------- verzonnen uitgangsstand ----------
const zet=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
zet('xtenate_tx',[{datum:'2026-01-01',bedrag:1,id:500,gb:'7000',rek:'1010',type:'uitgave',naam:'oud',omschr:''}]);
zet('xtenate_covers',[{id:243,artikel:'Funko',voorraad:11}]);
zet('xtenate_hnvi',[{id:15,datum:'2026-02-05',omschr:'bestaand lot'}]);
zet('xtenate_maand_saldos_override',{'2022-09':{begin:66.22,eind:216.96}});
const snapshot=JSON.stringify({...localStorage});

// ---------- een 2026-bestand met begin- en eindsaldo ----------
const rij=(datum,gb,bedrag,naam)=>{const r=new Array(10).fill(null);
  r[1]=datum; r[2]=gb; r[3]=bedrag; r[5]=naam; return r;};
const saldoRij=(label,waarde)=>{const r=new Array(10).fill(null); r[8]=label; r[9]=waarde; return r;};
const bank=[['kop'],['kop2']];
bank.push(rij(new Date(2026,0,15),'7900',-6.35,'PostNL'));
bank.push(rij(new Date(2026,0,16),'8010',222.63,'Bol.com'));
bank.push(saldoRij('Beginsaldo',111.11));
bank.push(saldoRij('Eindsaldo',327.39));
const wb=XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bank), 'Bank 2026-01');
const buf=XLSX.write(wb,{type:'array',bookType:'xlsx',cellDates:true});

const modals=await laad('modals.js?v=20260812c');

// ---------- lezen zonder bevestigen ----------
await new Promise(res=>{
  modals.importExcel({files:[new window.File([buf],'Administratie_2026.xlsx')],value:''});
  setTimeout(res,600);
});
ok('preview getoond', /Er is nog niets opgeslagen/.test(document.getElementById('import-body').innerHTML));
ok('preview toont xtenate_tx als doelsleutel',
   /xtenate_tx/.test(document.getElementById('import-body').innerHTML));
ok('opslag ongewijzigd zolang niet bevestigd', JSON.stringify({...localStorage})===snapshot);
modals.annuleerImport();
ok('annuleren schrijft niets', JSON.stringify({...localStorage})===snapshot);

// ---------- nu bevestigen ----------
await new Promise(res=>{
  modals.importExcel({files:[new window.File([buf],'Administratie_2026.xlsx')],value:''});
  setTimeout(res,600);
});
modals.bevestigImport();
const titel=document.getElementById('import-title').textContent;
ok('bevestigde 2026-import voltooit zonder fout', titel==='Import geslaagd!', titel);
ok('geen "OMZET_GB is not defined"',
   !/OMZET_GB/.test(document.getElementById('import-body').innerHTML));

const ruw=localStorage.getItem('xtenate_maand_saldos_override');
ok('xtenate_maand_saldos_override bestaat na de import', !!ruw);
const saldi=JSON.parse(ruw||'{}');
ok('2026-01 begin- en eindsaldo opgeslagen',
   saldi['2026-01'] && saldi['2026-01'].begin===111.11 && saldi['2026-01'].eind===327.39,
   JSON.stringify(saldi['2026-01']));
ok('bestaande maandsaldi van 2022 blijven staan',
   saldi['2022-09'] && saldi['2022-09'].eind===216.96, JSON.stringify(saldi['2022-09']));

// ---------- nog aanwezig bij een verse app-start ----------
// Een tweede, verse module-instantie leest de opslag opnieuw in, precies zoals
// bij het herladen van de pagina gebeurt.
const versStorage=await laad('storage.js?vers=' + Date.now());
ok('2026-01 nog aanwezig na een verse module-start',
   versStorage.MAAND_SALDOS['2026-01'] && versStorage.MAAND_SALDOS['2026-01'].eind===327.39,
   JSON.stringify(versStorage.MAAND_SALDOS['2026-01']));

// ---------- wat niet geraakt mocht worden ----------
const oud=JSON.parse(snapshot);
ok('HNVI onveranderd (geen HNVI-blad in dit bestand)',
   localStorage.getItem('xtenate_hnvi')===oud['xtenate_hnvi']);

console.log(f.length?`\n${f.length} MISLUKT: ${f.join(', ')}`:'\nalles goed');
process.exit(f.length?1:0);
