// Test stap 3: Home als startpagina (portaal), Overzicht behouden als eigen pagina.
import puppeteer from 'puppeteer-core';

const URL = 'http://localhost:8765/index.html';
const fails = [];
const ok = (n, c, e = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${e ? '  — ' + e : ''}`); if (!c) fails.push(n); };
const kop = t => console.log(`\n${t}`);

const browser = await puppeteer.launch({
  executablePath: '/opt/google/chrome/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

async function open(hash = '', breedte = 1280) {
  const page = await browser.newPage();
  const fouten = [];
  page.on('console', m => { if (m.type() === 'error') fouten.push(m.text()); });
  page.on('pageerror', e => fouten.push('pageerror: ' + e.message));
  await page.setViewport({ width: breedte, height: 900 });
  await page.goto(URL + hash, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => new Promise(r => setTimeout(r, 700)));
  await page.evaluate(() => { document.getElementById('auth-scherm').style.display = 'none'; });
  page.appFouten = () => fouten.filter(f =>
    !/supabase|esm\.sh|CORS|ERR_FAILED|403|net::|Chart is not defined/i.test(f));
  return page;
}

// ─────────────────────────────────────────── portaal verschijnt na inloggen
kop('1. Home is de startpagina na inloggen');
let page = await open();
const start = await page.evaluate(() => {
  window.gaNaar(window.paginaUitHash());       // dit is wat app.js na inloggen doet
  return {
    actief: document.querySelector('.page.active')?.id,
    titel: document.getElementById('topbar-title').textContent,
    kop: document.querySelector('.home-titel')?.textContent.trim(),
    sub: document.querySelector('.home-sub')?.textContent.trim(),
  };
});
ok('landt op p-home', start.actief === 'p-home', String(start.actief));
ok('topbar zegt Home', start.titel === 'Home', start.titel);
ok('welkomtekst staat er', /Welkom bij Xtenate Administratie/i.test(start.kop || ''), start.kop);
ok('portaal is geen financieel overzicht (geen kerncijfers op home)',
  await page.evaluate(() => !document.querySelector('#p-home .metric, #p-home canvas')), '');

// ─────────────────────────────────────────── tegels
kop('2. Tegels: aanwezig, compleet, klikbaar');
const tegels = await page.evaluate(() => [...document.querySelectorAll('#p-home .home-tegel')].map(t => ({
  titel: t.querySelector('.home-tegel-titel')?.textContent.trim(),
  uitleg: t.querySelector('.home-tegel-uitleg')?.textContent.trim(),
  merk: t.querySelector('.home-tegel-merk')?.textContent.trim() || null,
  regels: [...t.querySelectorAll('.home-tegel-regels span')].map(s => s.textContent.trim()),
  onclick: t.getAttribute('onclick'),
  tag: t.tagName,
})));
const gevraagd = ['Boekhouding', 'Beheer', 'Facturen', 'Voorraad',
  'Belasting', 'HNVI / Xtenate'];
for (const t of gevraagd) {
  ok(`tegel "${t}" aanwezig`, tegels.some(x => x.titel === t));
}
ok('precies zes tegels', tegels.length === 6, String(tegels.length));
ok('Overzicht/Grootboek/Controle zitten NIET meer los op Home',
  !tegels.some(x => ['Overzicht', 'Grootboek', 'Controle', 'Debiteuren', 'Crediteuren'].includes(x.titel)),
  tegels.map(t => t.titel).join(', '));
ok('elke tegel is een <button> (toetsenbordbereikbaar)', tegels.every(t => t.tag === 'BUTTON'),
  [...new Set(tegels.map(t => t.tag))].join(','));
ok('elke tegel heeft een titel en een uitleg',
  tegels.every(t => t.titel && t.uitleg), '');

// verwijzen de onclicks naar bestaande functies?
const kapot = await page.evaluate(() => {
  const stuk = [];
  document.querySelectorAll('#p-home .home-tegel').forEach(t => {
    const code = t.getAttribute('onclick') || '';
    const m = code.match(/^\s*([A-Za-z_$][\w$]*)\s*\(/);
    if (!m) { stuk.push('geen aanroep: ' + code); return; }
    if (typeof window[m[1]] !== 'function') stuk.push(m[1] + ' ontbreekt op window');
  });
  return stuk;
});
ok('alle tegel-onclicks verwijzen naar bestaande functies', kapot.length === 0, kapot.join(', ') || 'ok');

// ─────────────────────────────────────────── daadwerkelijk klikken
kop('3. Klikken op tegels navigeert echt');
for (const [titel, verwacht] of [
  ['Facturen', 'p-facturen'], ['Voorraad', 'p-voorraad'],
  ['Boekhouding', 'p-overzicht'], ['Beheer', 'p-beheer'],
  ['Belasting', 'p-belasting'], ['HNVI / Xtenate', 'p-hnvi'],
]) {
  const r = await page.evaluate(t => {
    window.nav('home');
    const knop = [...document.querySelectorAll('#p-home .home-tegel')]
      .find(x => x.querySelector('.home-tegel-titel')?.textContent.trim() === t);
    if (!knop) return { fout: 'tegel niet gevonden' };
    try { knop.click(); } catch (e) { if (!/Chart is not defined/.test(e.message)) return { fout: e.message }; }
    return { actief: document.querySelector('.page.active')?.id, hash: location.hash };
  }, titel);
  ok(`klik "${titel}" -> ${verwacht}`, !r.fout && r.actief === verwacht,
    r.fout || `${r.actief} hash=${r.hash}`);
}

// ─────────────────────────────────────────── Overzicht ongewijzigd
kop('4. Overzicht blijft bestaan als eigen pagina');
const ov = await page.evaluate(() => {
  try { window.nav('overzicht'); } catch (e) { /* Chart geblokkeerd in sandbox */ }
  const p = document.getElementById('p-overzicht');
  return {
    bestaat: !!p,
    actief: p?.classList.contains('active'),
    titel: p?.querySelector('.page-title')?.textContent.trim(),
    heeftJaarKiezer: !!document.getElementById('jaar-selector'),
    heeftKerncijfers: !!p?.querySelector('.metric, .kpi'),
    topbar: document.getElementById('topbar-title').textContent,
  };
});
ok('p-overzicht bestaat en wordt actief', ov.bestaat && ov.actief, JSON.stringify(ov));
ok('paginatitel is nog steeds Overzicht', ov.titel === 'Overzicht', ov.titel);
ok('jaarkiezer is behouden', ov.heeftJaarKiezer === true);
ok('kerncijfers staan op Overzicht, niet op Home', ov.heeftKerncijfers === true);
ok('topbar zegt Overzicht', ov.topbar === 'Overzicht', ov.topbar);

// ─────────────────────────────────────────── sidebar
kop('5. Sidebar: Home en Overzicht allebei bereikbaar');
const nav = await page.evaluate(() => ({
  items: [...document.querySelectorAll('.nav-item[data-page]')].map(n => n.dataset.page),
  secties: [...document.querySelectorAll('.nav-section')].map(n => n.textContent.trim()),
  volgorde: [...document.querySelectorAll('.nav-section, .nav-item[data-page]')]
    .map(n => n.classList.contains('nav-section') ? n.textContent.trim() : 'nav:' + n.dataset.page),
}));
ok('nav bevat home, overzicht, facturen en beheer',
  ['home', 'overzicht', 'facturen', 'beheer'].every(x => nav.items.includes(x)), nav.items.join(','));
ok('debiteuren/crediteuren staan niet meer los in de nav',
  !nav.items.includes('debiteuren') && !nav.items.includes('crediteuren'));
ok('secties zijn Start / Boekhouding / Magazijn / Beheer',
  JSON.stringify(nav.secties) === JSON.stringify(['Start', 'Boekhouding', 'Magazijn', 'Beheer']),
  nav.secties.join(' | '));
ok('Overzicht staat onder Boekhouding',
  nav.volgorde.indexOf('Boekhouding') < nav.volgorde.indexOf('nav:overzicht')
  && nav.volgorde.indexOf('nav:overzicht') < nav.volgorde.indexOf('Magazijn'),
  nav.volgorde.join(' > '));
ok('Controle staat onder Beheer',
  nav.volgorde.indexOf('Beheer') < nav.volgorde.indexOf('nav:controle'),
  nav.volgorde.join(' > '));

ok('geen app-eigen console-fouten', page.appFouten().length === 0, page.appFouten().join(' | ') || 'geen');
await page.close();

// ─────────────────────────────────────────── cijfers op de tegels
kop('6. Tegels tonen kloppende cijfers');
page = await open();
const cijfers = await page.evaluate(async () => {
  const F = await import('./facturen.js?v=20260812c');
  const S = await import('./storage.js?v=20260812c');
  // Drie facturen: 1 debiteur te laat, 1 debiteur open, 1 crediteur open.
  S.state.FACTUREN = []; S.state.nxtFactuur = 1;
  F.voegFactuurToe({ soort: 'debiteur', datum: '2020-01-01', vervaldatum: '2020-02-01', bedrag: 100 });
  F.voegFactuurToe({ soort: 'debiteur', datum: '2099-01-01', vervaldatum: '2099-02-01', bedrag: 50 });
  F.voegFactuurToe({ soort: 'crediteur', datum: '2099-01-01', vervaldatum: '2099-02-01', bedrag: 300 });
  window.nav('home');
  const lees = t => {
    const k = [...document.querySelectorAll('#p-home .home-tegel')]
      .find(x => x.querySelector('.home-tegel-titel')?.textContent.trim() === t);
    return {
      merk: k?.querySelector('.home-tegel-merk')?.textContent.trim() || null,
      regels: [...k.querySelectorAll('.home-tegel-regels span')].map(s => s.textContent.trim()),
    };
  };
  const uit = { fac: lees('Facturen'), vrd: lees('Voorraad'),
    boek: lees('Boekhouding'), aantalTX: S.state.TX.length, aantalHist: S.state.HIST_TX.length };
  S.state.FACTUREN = []; S.state.nxtFactuur = 1;   // opruimen
  localStorage.removeItem('xtenate_facturen');
  return uit;
});
ok('facturen-tegel meldt 1 te laat', /1 te laat/.test(cijfers.fac.merk || ''), String(cijfers.fac.merk));
ok('facturen-tegel toont te ontvangen en te betalen',
  cijfers.fac.regels.some(r => /Te ontvangen/.test(r)) && cijfers.fac.regels.some(r => /Te betalen/.test(r)),
  cijfers.fac.regels.join(' · '));
ok('boekhouding-tegel toont het aantal boekingen',
  cijfers.boek.regels.some(r => r.includes(String(cijfers.aantalTX))), cijfers.boek.regels.join(' · '));
ok('boekingen ongewijzigd: 161 en 473',
  cijfers.aantalTX === 161 && cijfers.aantalHist === 473,
  `${cijfers.aantalTX} / ${cijfers.aantalHist}`);
ok('voorraad-tegel toont 21 artikelen', cijfers.vrd.regels.some(r => /21 artikelen/.test(r)),
  cijfers.vrd.regels.join(' · '));
await page.close();

// ─────────────────────────────────────────── layout
kop('7. Layout op smalle en brede schermen');
for (const w of [320, 375, 768, 1280]) {
  const p2 = await open('#home', w);
  const r = await p2.evaluate(() => {
    window.nav('home');
    const tegels = [...document.querySelectorAll('#p-home .home-tegel')];
    const wrap = document.querySelector('.page-wrap');
    const wr = wrap.getBoundingClientRect();
    const buiten = tegels.filter(t => {
      const q = t.getBoundingClientRect();
      return q.left < wr.left - 0.5 || q.right > wr.right + 0.5;
    }).length;
    const raster = document.querySelector('.home-tegels');
    const rr = raster.getBoundingClientRect();
    return {
      n: tegels.length, buiten,
      // Het tegelraster zelf mag niet breder zijn dan de pagina. De topbar heeft
      // een bestaande overloop (select + icoonknop) die er al vóór fase 7 was;
      // die meten we hier bewust niet mee.
      rasterPast: raster.scrollWidth <= raster.clientWidth + 1 && rr.width <= wr.width + 1,
      minH: Math.min(...tegels.map(t => t.getBoundingClientRect().height)),
      kolommen: new Set(tegels.map(t => Math.round(t.getBoundingClientRect().left))).size,
    };
  });
  ok(`${String(w).padStart(4)}px: ${r.n} tegels binnen de pagina, raster past, ${r.kolommen} kolom(men)`,
    r.buiten === 0 && r.rasterPast && r.minH > 40,
    `buiten=${r.buiten} raster-past=${r.rasterPast} min-hoogte=${Math.round(r.minH)}`);
  await p2.close();
}

await browser.close();
console.log('\n' + '='.repeat(56));
console.log(fails.length ? `${fails.length} FAIL(S):\n - ${fails.join('\n - ')}` : 'ALLES PASS');
console.log('='.repeat(56));
process.exit(fails.length ? 1 : 0);
