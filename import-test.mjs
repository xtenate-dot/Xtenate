// Test op de importreparaties. Schrijft niets naar localStorage tenzij
import { fileURLToPath } from 'url'; import path from 'path';
// Paden vanuit dit bestand, niet vanuit de werkmap. `fs` las cwd-relatief en
// `import()` bestandsrelatief, waardoor de test alleen leek te werken.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bestand = n => path.join(ROOT, n);
const laad = n => import(new URL('../' + n, import.meta.url).href);
// expliciet bevestigd, en controleert dat de herstelde gegevens intact blijven.
import { JSDOM } from 'jsdom'; import fs from 'fs'; import { webcrypto } from 'crypto';
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

// ---------- 1. excelDate in vier tijdzones ----------
const src=fs.readFileSync(bestand('modals.js'),'utf8');
// Accolades tellen in plaats van tot een losse marker knippen: die marker
// (`const OMZET_GB`) staat sinds de scope-fix boven excelDate, niet eronder.
function knipFunctie(tekst, kop){
  const start=tekst.indexOf(kop); if(start<0) throw new Error('functie '+kop+' niet gevonden');
  let i=tekst.indexOf('{',start), diepte=0;
  for(;i<tekst.length;i++){ if(tekst[i]==='{') diepte++; else if(tekst[i]==='}'){ diepte--; if(!diepte) return tekst.slice(start,i+1); } }
  throw new Error('geen sluitende accolade voor '+kop);
}
const excelDate=new Function('return ('+knipFunctie(src,'function excelDate(val)')+')')();
const proef=['2022-08-02','2023-01-01','2022-12-31','2024-01-01','2025-06-15','2026-02-05'];
console.log('--- excelDate, huidige tijdzone', Intl.DateTimeFormat().resolvedOptions().timeZone, '---');
let fout=0;
proef.forEach(d=>{
  const [j,m,dd]=d.split('-').map(Number);
  const lokaleDate=new Date(j,m-1,dd);           // zoals SheetJS levert
  const serie=Math.round(Date.UTC(j,m-1,dd)/86400000)+25569;
  if(excelDate(lokaleDate)!==d) fout++;
  if(excelDate(serie)!==d) fout++;
  if(excelDate(d)!==d) fout++;
  console.log(`  ${d}: Date→${excelDate(lokaleDate)} getal→${excelDate(serie)} tekst→${excelDate(d)}`);
});
ok('excelDate klopt op alle drie de celtypen', fout===0, `${fout} afwijkingen`);
ok('2022-08-02 blijft 2022-08-02', excelDate(new Date(2022,7,2))==='2022-08-02', excelDate(new Date(2022,7,2)));
ok('tekst JJJJ-MM-DD blijft ongewijzigd', excelDate('2022-08-02')==='2022-08-02');
ok('lege cel geeft null', excelDate(null)===null && excelDate(0)===null && excelDate('')===null);

// ---------- 2. de herstelde gegevens klaarzetten ----------
const bron=fs.readFileSync(bestand('storage.js'),'utf8');
const DEF=JSON.parse(bron.match(/export const HIST_TX_DEFAULT = (\[[\s\S]*?\]);\n/)[1]);
const hist=DEF.map((t,i)=>({...t,id:'h'+t.datum.slice(0,4)+'_'+(500+i)}));   // hersteld: juiste datums
const tx=[{datum:'2026-01-01',bedrag:1,id:500,gb:'7000',rek:'1010',type:'uitgave',naam:'x',omschr:''}];
const covers=[{id:243,artikel:'Funko',voorraad:11}];
const ms={'2022-09':{begin:66.22,eind:216.96}};
const ht={'2022':{omzet:1114.56,kosten:3449.69,priveOp:250,priveSt:2187.38}};
const hnvi=[{id:15,datum:'2026-02-05',omschr:'lot'}];
const zet=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
zet('xtenate_hist_tx_override',hist); zet('xtenate_tx',tx); zet('xtenate_covers',covers);
zet('xtenate_maand_saldos_override',ms); zet('xtenate_home_totals_override',ht); zet('xtenate_hnvi',hnvi);
const snapshot=JSON.stringify({...localStorage});

// ---------- 3. een testbestand met een terugstorting ----------
const bank=[['kop'],['kop2']];
const rij=(datum,gb,bedrag,omschr,naam)=>{const r=new Array(8).fill(null);
  r[1]=datum; r[2]=gb; r[3]=bedrag; r[4]=omschr; r[5]=naam; return r;};
bank.push(rij(new Date(2027,0,15),'7900',-6.35,'','PostNL'));
bank.push(rij(new Date(2027,0,16),'600',100,'','Prive storting'));
bank.push(rij(new Date(2027,0,17),'601',-50,'','Prive opname'));
const cc=[['kop'],['kop2']];
const ccRij=(datum,gb,bedrag,omschr)=>{const r=new Array(11).fill(null);
  r[7]=datum; r[8]=gb; r[9]=bedrag; r[10]=omschr; return r;};
cc.push(ccRij(new Date(2027,0,4),'4815',-353.16,'Siteground'));
cc.push(ccRij(new Date(2027,0,21),'4815',305.99,'Siteground terugstorting'));
cc.push(ccRij(new Date(2027,0,22),'7000',-74.86,'Alibaba'));
cc.push(ccRij(new Date(2027,0,23),'600',-500,'Prive storting op de kaart'));
// Per Periode levert de jaartotalen. Staat hier zodat de bevestigde import ook
// die tak doorloopt — daar zat de OMZET_GB-fout, ná het schrijven van de historie.
const perPeriode=[['Rekening','Totaal'],['8000',-100],['9990',500],['600',-250],['601',75],['7010',30]];
const wb=XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bank), 'Bank 2027-01');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cc), 'Creditkaart Prive');
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(perPeriode), 'Per Periode');
const buf=XLSX.write(wb,{type:'array',bookType:'xlsx',cellDates:true});

const modals=await laad('modals.js?v=20260812c');
const dashboard=await laad('dashboard.js?v=20260812c');
Object.assign(window,{bevestigImport:modals.bevestigImport,annuleerImport:modals.annuleerImport});
window.renderHome=()=>{};
global.renderHome=window.renderHome;

await new Promise(res=>{
  const input={files:[new window.File([buf],'Administratie_2027.xlsx')],value:''};
  modals.importExcel(input);
  setTimeout(res,600);
});
const body=document.getElementById('import-body').innerHTML;
ok('preview getoond, niets opgeslagen', /Er is nog niets opgeslagen/.test(body));
ok('preview toont de doelsleutel', /xtenate_hist_tx_override/.test(body));
ok('preview toont hoeveel records verdwijnen', /Bestaande records die verdwijnen/.test(body));
ok('preview toont hoeveel er bij komen', /Nieuwe records die erbij komen/.test(body));
ok('preview toont het tekenprobleem', /tegengesteld teken|terugstorting/.test(body), 
   (body.match(/regel\(s\) met een tegengesteld teken/)||['niet gevonden'])[0]);
ok('preview toont de tekenconventie', /uitgaven staan negatief/.test(body));
ok('opslag ongewijzigd zolang niet bevestigd', JSON.stringify({...localStorage})===snapshot);

// annuleren mag ook niets doen
modals.annuleerImport();
ok('annuleren schrijft niets', JSON.stringify({...localStorage})===snapshot);

// ---------- 4. nu wél bevestigen, en kijken wat er is geboekt ----------
await new Promise(res=>{
  const input={files:[new window.File([buf],'Administratie_2027.xlsx')],value:''};
  modals.importExcel(input); setTimeout(res,600);
});
modals.bevestigImport();
const titel=document.getElementById('import-title').textContent;
const naBody=document.getElementById('import-body').innerHTML;
ok('bevestigde import voltooit zonder fout', titel==='Import geslaagd!', titel);
ok('geen "OMZET_GB is not defined"', !/OMZET_GB/.test(naBody),
   (naBody.match(/Er ging iets mis: .*/)||[''])[0].slice(0,80));
ok('renderHome() draait zonder fout na de import',
   (()=>{ try { dashboard.renderHome(); return true; } catch(e){ return 'FOUT: '+e.message; } })()===true);
const htNa=JSON.parse(localStorage.getItem('xtenate_home_totals_override'));
ok('jaartotalen uit "Per Periode" toegepast op 2027',
   htNa['2027'] && htNa['2027'].kosten===500 && htNa['2027'].priveSt===250 && htNa['2027'].omzet===100,
   JSON.stringify(htNa['2027']));
const na=JSON.parse(localStorage.getItem('xtenate_hist_tx_override'));
const n2027=na.filter(t=>t.datum.startsWith('2027'));
ok('2027 is toegevoegd', n2027.length===7, String(n2027.length));
const dat=n2027.map(t=>t.datum).sort();
ok('geen enkele datum verschoven', dat[0]==='2027-01-04' && dat[dat.length-1]==='2027-01-23', dat.join(' '));
const terug=n2027.find(t=>Math.abs(t.bedrag-305.99)<0.005);
ok('terugstorting NIET als uitgave geboekt', terug && terug.type==='inkomst', terug?terug.type:'niet gevonden');
const uitg=n2027.find(t=>Math.abs(t.bedrag-353.16)<0.005);
ok('gewone creditcarduitgave blijft uitgave', uitg && uitg.type==='uitgave', uitg?uitg.type:'-');
const st600=n2027.filter(t=>t.gb==='600');
const op601=n2027.filter(t=>t.gb==='601');
ok('gb 600 altijd prive_storting, ook bij een negatief bedrag',
   st600.length===2 && st600.every(t=>t.type==='prive_storting'),
   st600.map(t=>t.gb+'='+t.type).join(' '));
ok('gb 601 altijd prive_opname', op601.length===1 && op601[0].type==='prive_opname',
   op601.map(t=>t.gb+'='+t.type).join(' '));

// ---------- 5. de herstelde gegevens moeten intact zijn ----------
const oud=JSON.parse(snapshot);
ok('xtenate_tx onveranderd', localStorage.getItem('xtenate_tx')===oud['xtenate_tx']);
ok('voorraad onveranderd', localStorage.getItem('xtenate_covers')===oud['xtenate_covers']);
ok('HNVI onveranderd', localStorage.getItem('xtenate_hnvi')===oud['xtenate_hnvi']);
ok('herstelde jaren 2022-2025 onveranderd',
   JSON.stringify(na.filter(t=>!t.datum.startsWith('2027')))===JSON.stringify(hist),
   `${na.filter(t=>!t.datum.startsWith('2027')).length} van ${hist.length}`);
ok('priveSt 2022 nog 2187.38',
   JSON.parse(localStorage.getItem('xtenate_home_totals_override'))['2022'].priveSt===2187.38);

// ---------- 6. een bestand mét HNVI Loten ----------
// De loten werden eerder al bij het lezen weggeschreven: bestand kiezen was
// genoeg om de bestaande loten kwijt te raken, en Annuleren draaide dat niet
// terug. Deze fase bewaakt dat het schrijven pas bij de bevestiging gebeurt.
const bank28=[['kop'],['kop2']];
bank28.push(rij(new Date(2028,0,10),'7900',-6.35,'','PostNL 2028'));
const lotKop=['datum','omschr','inkoop','verkoop','','status','noot','id'];
const loten=[lotKop,
  [new Date(2028,0,2),'Lot uit het bestand A',10,null,null,'voorraad','',901],
  [new Date(2028,0,3),'Lot uit het bestand B',20,35,null,'verkocht','',902]];
const wb2=XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet(bank28), 'Bank 2028-01');
XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet(loten), 'HNVI Loten');
const buf2=XLSX.write(wb2,{type:'array',bookType:'xlsx',cellDates:true});

const hnviVoor=localStorage.getItem('xtenate_hnvi');
const snapshot2=JSON.stringify({...localStorage});

await new Promise(res=>{
  modals.importExcel({files:[new window.File([buf2],'MetLoten.xlsx')],value:''});
  setTimeout(res,600);
});
const body2=document.getElementById('import-body').innerHTML;
ok('HNVI-bestand: preview getoond', /Er is nog niets opgeslagen/.test(body2));
ok('HNVI-bestand: preview meldt de lotenvervanging', /HNVI-loten worden vervangen/.test(body2));
ok('HNVI-bestand: xtenate_hnvi ongewijzigd vóór bevestiging',
   localStorage.getItem('xtenate_hnvi')===hnviVoor, localStorage.getItem('xtenate_hnvi'));
ok('HNVI-bestand: hele opslag ongewijzigd vóór bevestiging',
   JSON.stringify({...localStorage})===snapshot2);

modals.annuleerImport();
ok('HNVI-bestand: annuleren laat xtenate_hnvi met rust',
   localStorage.getItem('xtenate_hnvi')===hnviVoor, localStorage.getItem('xtenate_hnvi'));
ok('HNVI-bestand: annuleren schrijft niets',
   JSON.stringify({...localStorage})===snapshot2);

// nu wél bevestigen: dan moeten de loten er juist wél in
await new Promise(res=>{
  modals.importExcel({files:[new window.File([buf2],'MetLoten.xlsx')],value:''});
  setTimeout(res,600);
});
modals.bevestigImport();
ok('HNVI-bestand: bevestigde import voltooit zonder fout',
   document.getElementById('import-title').textContent==='Import geslaagd!',
   document.getElementById('import-title').textContent);
const hnviNa=JSON.parse(localStorage.getItem('xtenate_hnvi'));
ok('HNVI-bestand: loten pas ná bevestiging opgeslagen',
   Array.isArray(hnviNa) && hnviNa.length===2
   && hnviNa[0].omschr==='Lot uit het bestand A' && hnviNa[1].status==='verkocht',
   JSON.stringify(hnviNa));
ok('HNVI-bestand: datums van de loten niet verschoven',
   hnviNa[0].datum==='2028-01-02' && hnviNa[1].datum==='2028-01-03',
   hnviNa.map(l=>l.datum).join(' '));

console.log(f.length?`\n${f.length} MISLUKT: ${f.join(', ')}`:'\nalles goed');
process.exit(f.length?1:0);
