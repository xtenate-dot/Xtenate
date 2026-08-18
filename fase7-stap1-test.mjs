// Test stap 1: routing voor Debiteuren/Crediteuren + hash-routing.
// Draait in echte Chromium zodat de window-bedrading van onclick echt wordt getest.
import puppeteer from 'puppeteer-core';

const URL = 'http://localhost:8765/index.html';
const fails = [];
const ok = (n, c, e = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${e ? '  — ' + e : ''}`); if (!c) fails.push(n); };
const kop = t => console.log(`\n${t}`);

const browser = await puppeteer.launch({
  executablePath: '/opt/google/chrome/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

async function nieuwePagina(hash = '') {
  const page = await browser.newPage();
  const fouten = [];
  page.on('console', m => { if (m.type() === 'error') fouten.push(m.text()); });
  page.on('pageerror', e => fouten.push('pageerror: ' + e.message));
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(URL + hash, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => new Promise(r => setTimeout(r, 700)));
  await page.evaluate(() => { document.getElementById('auth-scherm').style.display = 'none'; });
  page.appFouten = () => fouten.filter(f => !/supabase|esm\.sh|CORS|ERR_FAILED|403|net::/i.test(f));
  return page;
}

const ALLE = ['home', 'overzicht', 'bank', 'facturen', 'grootboek', 'belasting', 'controle', 'voorraad', 'hnvi', 'beheer'];

// ---------------------------------------------------------------- bedrading
kop('1. Bedrading: zijn de onclick-functies bereikbaar op window?');
let page = await nieuwePagina();
for (const fn of ['nav', 'gaNaar', 'renderFacturen', 'kiesFactuurTab', 'renderBeheer', 'renderPortaal']) {
  const t = await page.evaluate(f => typeof window[f], fn);
  ok(`window.${fn} bestaat`, t === 'function', t);
}

// Elke onclick in de sidebar moet naar een bestaande functie wijzen.
const kapotteOnclicks = await page.evaluate(() => {
  const stuk = [];
  document.querySelectorAll('.nav-item[onclick], .nav-item[data-page]').forEach(n => {
    const code = n.getAttribute('onclick') || '';
    const m = code.match(/^\s*([A-Za-z_$][\w$]*)\s*\(/);
    if (m && typeof window[m[1]] !== 'function') stuk.push(n.textContent.trim() + ' -> ' + m[1]);
  });
  return stuk;
});
ok('geen enkele nav-onclick verwijst naar een ontbrekende functie', kapotteOnclicks.length === 0,
  kapotteOnclicks.join(', ') || 'alle koppelingen aanwezig');

// ------------------------------------------------------- alle pagina's laden
kop('2. Alle tien pagina\'s renderen zonder fout');
for (const p of ALLE) {
  const r = await page.evaluate(naam => {
    let fout = null;
    try { window.nav(naam); } catch (e) { fout = e.message; }
    const container = document.getElementById('p-' + naam);
    const knop = document.querySelector(`.nav-item[data-page="${naam}"]`);
    return {
      fout,
      actief: !!(container && container.classList.contains('active')),
      knopActief: !!(knop && knop.classList.contains('active')),
      titel: document.getElementById('topbar-title').textContent,
      aantalActief: document.querySelectorAll('.page.active').length,
      hash: location.hash,
    };
  }, p);
  // Chart.js komt van cdnjs en is in deze sandbox geblokkeerd, net als Supabase.
  // Dat is geen regressie van deze wijziging; het gebeurt ook op onveranderde main.
  const chartArtefact = r.fout && /Chart is not defined/.test(r.fout);
  ok(`${p.padEnd(12)} rendert, precies 1 pagina actief, hash klopt`,
    (!r.fout || chartArtefact) && r.actief && r.knopActief && r.aantalActief === 1 && r.hash === '#' + p,
    (chartArtefact ? '(Chart.js geblokkeerd in sandbox, routing wel goed) ' : (r.fout || '')) +
    `actief=${r.actief} knop=${r.knopActief} n=${r.aantalActief} hash=${r.hash} titel="${r.titel}"`);
}
ok('geen app-eigen console-fouten na alle pagina\'s', page.appFouten().length === 0,
  page.appFouten().join(' | ') || 'geen');

// ------------------------------------------------- inhoud nieuwe pagina's
kop('3. Nieuwe pagina\'s tonen een nette lege staat');
const leeg = await page.evaluate(() => {
  window.nav('facturen');
  window.kiesFactuurTab('debiteur');
  const d = document.getElementById('facturen-inhoud').textContent.trim();
  window.kiesFactuurTab('crediteur');
  const c = document.getElementById('facturen-inhoud').textContent.trim();
  return { d, c };
});
ok('tabblad Debiteuren toont lege staat', leeg.d.length > 0 && /verkoopfacturen/i.test(leeg.d), leeg.d.slice(0, 50));
ok('tabblad Crediteuren toont lege staat', leeg.c.length > 0 && /inkoopfacturen/i.test(leeg.c), leeg.c.slice(0, 50));
await page.close();

// ------------------------------------------------------------ hash-routing
kop('4. Hash-routing: refresh, directe link, terugknop');
// startAuth() vuurt in deze sandbox niet (Supabase-CDN geblokkeerd), dus we
// roepen dezelfde regel aan die app.js na inloggen uitvoert.
const bootstrap = () => window.gaNaar(window.paginaUitHash());

page = await nieuwePagina('#grootboek');
const direct = await page.evaluate(b => { eval('(' + b + ')()'); return {
  actief: document.querySelector('.page.active')?.id,
  titel: document.getElementById('topbar-title').textContent,
}; }, bootstrap.toString());
ok('directe link #grootboek opent Grootboek', direct.actief === 'p-grootboek', `${direct.actief} / ${direct.titel}`);
await page.close();

page = await nieuwePagina('#facturen');
const directNieuw = await page.evaluate(b => { eval('(' + b + ')()');
  return document.querySelector('.page.active')?.id; }, bootstrap.toString());
ok('directe link #facturen opent Facturen', directNieuw === 'p-facturen', String(directNieuw));

const zonderHash = await (async () => { const p2 = await nieuwePagina();
  const r = await p2.evaluate(b => {
    try { eval('(' + b + ')()'); } catch (e) { /* Chart.js geblokkeerd; routing telt */ }
    return document.querySelector('.page.active')?.id; }, bootstrap.toString());
  await p2.close(); return r; })();
ok('zonder hash opent Home, precies als voorheen', zonderHash === 'p-home', String(zonderHash));

// terugknop
await page.evaluate(() => window.nav('voorraad'));
await page.goBack({ waitUntil: 'domcontentloaded' });
await page.evaluate(() => new Promise(r => setTimeout(r, 300)));
const naTerug = await page.evaluate(() => ({ id: document.querySelector('.page.active')?.id, hash: location.hash }));
ok('terugknop gaat terug naar de vorige pagina', naTerug.id === 'p-facturen', `${naTerug.id} hash=${naTerug.hash}`);
await page.close();

page = await nieuwePagina('#onzin-bestaat-niet');
const onbekend = await page.evaluate(() => document.querySelector('.page.active')?.id);
ok('onbekende hash valt terug op Home', onbekend === 'p-home', String(onbekend));
await page.close();

// geen renderlus
kop('5. Geen renderlus door hash <-> nav');
page = await nieuwePagina();
const lus = await page.evaluate(async () => {
  let tellingen = 0;
  const orig = window.nav;
  window.nav = function (...a) { tellingen++; return orig.apply(this, a); };
  window.nav('bank');
  await new Promise(r => setTimeout(r, 400));   // hashchange zou nu kunnen vuren
  window.nav = orig;
  return tellingen;
});
ok('nav wordt niet herhaald aangeroepen door de hash', lus === 1, `${lus} aanroepen`);
await page.close();

await browser.close();
console.log('\n' + '='.repeat(56));
console.log(fails.length ? `${fails.length} FAIL(S):\n - ${fails.join('\n - ')}` : 'ALLES PASS');
console.log('='.repeat(56));
process.exit(fails.length ? 1 : 0);
