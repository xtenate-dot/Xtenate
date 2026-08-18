// Test stap 2: facturen-datalaag. Laadt de echte modules in jsdom.
import { JSDOM } from 'jsdom'; import fs from 'fs'; import { webcrypto } from 'crypto';
import { fileURLToPath } from 'url'; import path from 'path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const laad = n => import(new URL('../' + n, import.meta.url).href);

const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'),
  { url: 'https://x.test/', runScripts: 'outside-only' });
const { window } = dom;
global.window = window; global.document = window.document;
Object.defineProperty(global, 'navigator', { value: window.navigator, configurable: true });
Object.defineProperty(window, 'crypto', { value: webcrypto, configurable: true });
global.localStorage = window.localStorage;
localStorage.clear();

const fails = [];
const ok = (n, c, e = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${e ? '  — ' + e : ''}`); if (!c) fails.push(n); };
const kop = t => console.log(`\n${t}`);

const S = await laad('storage.js?v=20260812c');
const F = await laad('facturen.js?v=20260812c');
const { state } = S;

// ──────────────────────────────────────── bestaande data ongemoeid
kop('1. Bestaande data blijft volledig ongemoeid');
ok('TX telt 161 boekingen', state.TX.length === 161, String(state.TX.length));
ok('HIST_TX telt 473 boekingen', state.HIST_TX.length === 473, String(state.HIST_TX.length));
ok('samen 634', state.TX.length + state.HIST_TX.length === 634);
ok('COVERS telt 21 artikelen', state.COVERS.length === 21, String(state.COVERS.length));
ok('FACTUREN begint leeg', Array.isArray(state.FACTUREN) && state.FACTUREN.length === 0,
  String(state.FACTUREN.length));
ok('nxtFactuur begint op 1', state.nxtFactuur === 1, String(state.nxtFactuur));
const sleutelsVoor = Object.keys(localStorage).sort().join(',');

// ──────────────────────────────────────── aanmaken
kop('2. Factuur aanmaken');
const d1 = F.voegFactuurToe({ soort: 'debiteur', relatie: 'Bol.com B.V.', datum: '2026-08-01', bedrag: 250 });
ok('id volgt patroon f<jaar>_<nr>', d1.id === 'f2026_001', d1.id);
ok('vervaldatum = datum + 30 dagen (debiteur)', d1.vervaldatum === '2026-08-31', d1.vervaldatum);
ok('status open', d1.status === 'open', d1.status);
ok('txIds is een lege array', Array.isArray(d1.txIds) && d1.txIds.length === 0);
ok('nxtFactuur opgehoogd', state.nxtFactuur === 2, String(state.nxtFactuur));

const c1 = F.voegFactuurToe({ soort: 'crediteur', relatie: 'Alipay', datum: '2026-08-01', bedrag: 80 });
ok('crediteur krijgt 14 dagen termijn', c1.vervaldatum === '2026-08-15', c1.vervaldatum);

const neg = F.voegFactuurToe({ soort: 'debiteur', datum: '2026-08-01', bedrag: -99 });
ok('negatief bedrag wordt positief opgeslagen', neg.bedrag === 99, String(neg.bedrag));
const raar = F.voegFactuurToe({ soort: 'onzin', datum: '2026-08-01', bedrag: 10 });
ok('onbekende soort valt terug op debiteur', raar.soort === 'debiteur', raar.soort);

// ──────────────────────────────────────── status, incl. randgevallen
kop('3. Status en randgevallen');
const peil = '2026-09-01';
ok('open voor de vervaldatum', F.factuurStatus(d1, '2026-08-15') === 'open', F.factuurStatus(d1, '2026-08-15'));
ok('vervallen na de vervaldatum', F.factuurStatus(d1, peil) === 'vervallen', F.factuurStatus(d1, peil));
ok('vervaldatum precies vandaag = nog open',
  F.factuurStatus(d1, '2026-08-31') === 'open', F.factuurStatus(d1, '2026-08-31'));
ok('dag NA vervaldatum = vervallen',
  F.factuurStatus(d1, '2026-09-01') === 'vervallen', F.factuurStatus(d1, '2026-09-01'));

const zonderVerval = F.maakFactuur({ soort: 'debiteur', datum: '2026-01-01', bedrag: 5, vervaldatum: '' });
zonderVerval.vervaldatum = '';
ok('factuur zonder vervaldatum blijft open', F.factuurStatus(zonderVerval, '2030-01-01') === 'open',
  F.factuurStatus(zonderVerval, '2030-01-01'));

ok('"vervallen" wordt NIET opgeslagen als status', d1.status === 'open', d1.status);
ok('dagenTeLaat klopt', F.dagenTeLaat(d1, '2026-09-10') === 10, String(F.dagenTeLaat(d1, '2026-09-10')));
ok('dagenTeLaat is 0 als niet te laat', F.dagenTeLaat(d1, '2026-08-01') === 0);
ok('vervaltBinnenkort binnen 7 dagen', F.vervaltBinnenkort(d1, '2026-08-28') === true);
ok('vervaltBinnenkort niet bij 20 dagen', F.vervaltBinnenkort(d1, '2026-08-10') === false);

// oninbaar
F.werkFactuurBij(raar.id, { status: 'oninbaar' });
ok('oninbaar blijft oninbaar, ook na vervaldatum',
  F.factuurStatus(F.vindFactuur(raar.id), '2030-01-01') === 'oninbaar');
ok('oninbaar telt niet als openstaand', F.isOpenstaand(F.vindFactuur(raar.id), '2030-01-01') === false);

// ──────────────────────────────────────── koppelen aan boekingen
kop('4. Koppelen aan een bestaande boeking');
const bestaandeTx = state.TX[0];
const r1 = F.koppelBetaling(d1.id, bestaandeTx.id);
ok('koppelen lukt', r1.ok === true, r1.reden || '');
ok('status wordt betaald', F.factuurStatus(F.vindFactuur(d1.id), '2030-01-01') === 'betaald');
ok('betaald telt niet meer als openstaand', F.isOpenstaand(F.vindFactuur(d1.id), '2030-01-01') === false);
ok('tweede keer koppelen wordt geweigerd', F.koppelBetaling(d1.id, bestaandeTx.id).ok === false);
ok('koppelen aan onbestaande boeking wordt geweigerd',
  F.koppelBetaling(d1.id, 'bestaat-niet-999').ok === false);
ok('de boeking zelf is niet gewijzigd',
  JSON.stringify(state.TX[0]) === JSON.stringify(bestaandeTx));

const histTx = state.HIST_TX[0];
const c2 = F.voegFactuurToe({ soort: 'crediteur', datum: '2025-01-01', bedrag: 40 });
ok('koppelen aan een historische boeking lukt ook', F.koppelBetaling(c2.id, histTx.id).ok === true);
ok('facturenBijBoeking vindt de koppeling', F.facturenBijBoeking(histTx.id).length === 1);

const u1 = F.ontkoppelBetaling(d1.id, bestaandeTx.id);
ok('ontkoppelen lukt', u1.ok === true, u1.reden || '');
ok('status valt terug naar open', F.vindFactuur(d1.id).status === 'open', F.vindFactuur(d1.id).status);
ok('ontkoppelen van iets ongekoppelds wordt geweigerd',
  F.ontkoppelBetaling(d1.id, bestaandeTx.id).ok === false);

// ──────────────────────────────────────── totalen en ouderdom
kop('5. Saldo en ouderdomsanalyse');
localStorage.removeItem('xtenate_facturen');
state.FACTUREN = []; state.nxtFactuur = 1;
F.voegFactuurToe({ soort: 'debiteur', datum: '2026-01-01', vervaldatum: '2026-01-31', bedrag: 100 }); // 90+
F.voegFactuurToe({ soort: 'debiteur', datum: '2026-04-01', vervaldatum: '2026-04-30', bedrag: 200 }); // 31-60
F.voegFactuurToe({ soort: 'debiteur', datum: '2026-05-15', vervaldatum: '2026-05-31', bedrag: 50 });  // 1-30
F.voegFactuurToe({ soort: 'debiteur', datum: '2026-06-01', vervaldatum: '2026-12-31', bedrag: 25 });  // niet vervallen
F.voegFactuurToe({ soort: 'crediteur', datum: '2026-06-01', vervaldatum: '2026-12-31', bedrag: 300 });

const P = '2026-06-15';
ok('openstaand debiteuren = 375', Math.abs(F.openstaandSaldo('debiteur', P) - 375) < 0.005,
  String(F.openstaandSaldo('debiteur', P)));
ok('openstaand crediteuren = 300', Math.abs(F.openstaandSaldo('crediteur', P) - 300) < 0.005,
  String(F.openstaandSaldo('crediteur', P)));
ok('debiteuren en crediteuren lopen niet door elkaar',
  F.facturenVan('debiteur', { peildatum: P }).length === 4 &&
  F.facturenVan('crediteur', { peildatum: P }).length === 1);

const oa = F.ouderdomsanalyse('debiteur', P);
ok('ouderdom 90+ : 1 stuk, 100', oa['90+ dagen'].aantal === 1 && oa['90+ dagen'].bedrag === 100,
  JSON.stringify(oa['90+ dagen']));
ok('ouderdom 31-60 : 1 stuk, 200', oa['31-60 dagen'].aantal === 1 && oa['31-60 dagen'].bedrag === 200,
  JSON.stringify(oa['31-60 dagen']));
ok('ouderdom 1-30 : 1 stuk, 50', oa['1-30 dagen'].aantal === 1 && oa['1-30 dagen'].bedrag === 50,
  JSON.stringify(oa['1-30 dagen']));
ok('niet vervallen : 1 stuk, 25', oa['niet vervallen'].aantal === 1 && oa['niet vervallen'].bedrag === 25,
  JSON.stringify(oa['niet vervallen']));

const sam = F.factuurSamenvatting(P);
ok('samenvatting debiteuren: 4 open, 3 te laat', sam.debiteuren.aantal === 4 && sam.debiteuren.teLaat === 3,
  JSON.stringify(sam.debiteuren));

// ──────────────────────────────────────── relaties
kop('6. Relatienamen normaliseren');
ok('"Bol.com B.V." en "Bol.com" vallen samen',
  F.relatieSleutel('Bol.com B.V.') === F.relatieSleutel('Bol.com'),
  `${F.relatieSleutel('Bol.com B.V.')} / ${F.relatieSleutel('Bol.com')}`);
ok('"Alipay EUROPE LTD S.A" normaliseert', F.relatieSleutel('Alipay EUROPE LTD S.A') === 'alipay europe',
  F.relatieSleutel('Alipay EUROPE LTD S.A'));
ok('lege naam geeft lege sleutel', F.relatieSleutel('') === '' && F.relatieSleutel(null) === '');

// ──────────────────────────────────────── verwijderen en persistentie
kop('7. Verwijderen en persistentie');
const teWissen = state.FACTUREN[0].id;
ok('verwijderen lukt', F.verwijderFactuur(teWissen) === true);
ok('verwijderen van onbekende id geeft false', F.verwijderFactuur('bestaat-niet') === false);
ok('lijst is 1 korter', state.FACTUREN.length === 4, String(state.FACTUREN.length));

const opgeslagen = JSON.parse(localStorage.getItem('xtenate_facturen'));
ok('opslag weerspiegelt de lijst', opgeslagen.length === 4, String(opgeslagen.length));
ok('verwijderde factuur staat niet in de opslag',
  !opgeslagen.some(f => f.id === teWissen));

// ──────────────────────────────────────── geen bestaande sleutel geraakt
kop('8. Geen bestaande opslagsleutel aangeraakt');
ok('TX nog steeds 161', state.TX.length === 161, String(state.TX.length));
ok('HIST_TX nog steeds 473', state.HIST_TX.length === 473, String(state.HIST_TX.length));
ok('geen hist-override weggeschreven',
  localStorage.getItem('xtenate_hist_tx_override') === null,
  String(localStorage.getItem('xtenate_hist_tx_override')));
const nieuweSleutels = Object.keys(localStorage).filter(k => !sleutelsVoor.split(',').includes(k)).sort();
ok('alleen facturen-sleutels toegevoegd',
  nieuweSleutels.every(k => k.startsWith('xtenate_facturen') || k.startsWith('xtenate_nxt_factuur')
    || k.startsWith('xtenate_factuur_')),
  nieuweSleutels.join(', ') || 'geen');

console.log('\n' + '='.repeat(56));
console.log(fails.length ? `${fails.length} FAIL(S):\n - ${fails.join('\n - ')}` : 'ALLES PASS');
console.log('='.repeat(56));
process.exit(fails.length ? 1 : 0);
