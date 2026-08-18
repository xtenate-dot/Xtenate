// Test stap 3b: Facturen met tabbladen, Beheer als pagina, deeplink-aliassen.
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
  await page.evaluate(() => {
    document.body.classList.remove('niet-ingelogd');
    document.getElementById('auth-scherm').style.display = 'none';
  });
  page.appFouten = () => fouten.filter(f =>
    !/supabase|esm\.sh|CORS|ERR_FAILED|403|net::|Chart is not defined/i.test(f));
  return page;
}

const bootstrap = () => window.gaNaar(window.paginaUitHash());

// ───────────────────────────────────────────────── Facturen met tabbladen
kop('1. Facturen: één pagina, twee tabbladen');
let page = await open();
const tabs = await page.evaluate(() => {
  window.nav('facturen');
  return {
    tabs: [...document.querySelectorAll('#facturen-tabs .vtab')].map(t => ({
      tekst: t.textContent.trim(), actief: t.classList.contains('active'),
      geselecteerd: t.getAttribute('aria-selected'), rol: t.getAttribute('role'),
      tabindex: t.getAttribute('tabindex'),
    })),
    titel: document.querySelector('#p-facturen .page-title')?.textContent.trim(),
    sub: document.querySelector('#p-facturen .page-sub')?.textContent.trim(),
  };
});
ok('pagina heet Facturen', tabs.titel === 'Facturen', tabs.titel);
ok('ondertitel noemt beide soorten', /verkoop.*inkoop/i.test(tabs.sub || ''), tabs.sub);
ok('twee tabbladen', tabs.tabs.length === 2, String(tabs.tabs.length));
ok('tabbladen heten Debiteuren en Crediteuren',
  /Debiteuren/.test(tabs.tabs[0].tekst) && /Crediteuren/.test(tabs.tabs[1].tekst),
  tabs.tabs.map(t => t.tekst).join(' | '));
ok('Debiteuren staat standaard open', tabs.tabs[0].actief && !tabs.tabs[1].actief);
ok('aria-selected klopt',
  tabs.tabs[0].geselecteerd === 'true' && tabs.tabs[1].geselecteerd === 'false');
ok('tabbladen zijn toetsenbordbereikbaar',
  tabs.tabs.every(t => t.rol === 'tab' && t.tabindex === '0'));

kop('2. Wisselen tussen tabbladen');
const wissel = await page.evaluate(() => {
  window.kiesFactuurTab('crediteur');
  const na = {
    actief: [...document.querySelectorAll('#facturen-tabs .vtab')].map(t => t.classList.contains('active')),
    inhoud: document.getElementById('facturen-inhoud').textContent.trim(),
  };
  window.kiesFactuurTab('debiteur');
  na.terug = document.getElementById('facturen-inhoud').textContent.trim();
  window.kiesFactuurTab('onzin');            // moet genegeerd worden
  na.naOnzin = [...document.querySelectorAll('#facturen-tabs .vtab')].map(t => t.classList.contains('active'));
  return na;
});
ok('crediteur-tab wordt actief', wissel.actief[1] === true && wissel.actief[0] === false);
ok('inhoud wisselt mee naar inkoopfacturen', /inkoopfacturen/i.test(wissel.inhoud), wissel.inhoud.slice(0, 45));
ok('terug naar debiteur toont verkoopfacturen', /verkoopfacturen/i.test(wissel.terug), wissel.terug.slice(0, 45));
ok('onbekend tabblad wordt genegeerd', wissel.naOnzin[0] === true && wissel.naOnzin[1] === false);
await page.close();

// ───────────────────────────────────────────────── deeplink-aliassen
kop('3. Oude deeplinks blijven werken');
for (const [hash, tab] of [['#debiteuren', 0], ['#crediteuren', 1]]) {
  const p2 = await open(hash);
  const r = await p2.evaluate(b => {
    try { eval('(' + b + ')()'); } catch (e) {}
    return {
      pagina: document.querySelector('.page.active')?.id,
      actief: [...document.querySelectorAll('#facturen-tabs .vtab')].map(t => t.classList.contains('active')),
    };
  }, bootstrap.toString());
  ok(`${hash} opent Facturen op het juiste tabblad`,
    r.pagina === 'p-facturen' && r.actief[tab] === true,
    `${r.pagina} actief=${JSON.stringify(r.actief)}`);
  await p2.close();
}

// ───────────────────────────────────────────────── Beheer-pagina
kop('4. Beheer is een echte pagina');
page = await open();
const beheer = await page.evaluate(() => {
  window.nav('beheer');
  const groepen = [...document.querySelectorAll('#p-beheer .beheer-groep')].map(g => ({
    naam: g.querySelector('.beheer-groep-kop')?.textContent.trim(),
    tegels: [...g.querySelectorAll('.home-tegel')].map(t => ({
      titel: t.querySelector('.home-tegel-titel')?.textContent.trim(),
      onclick: t.getAttribute('onclick'),
      gevaar: t.classList.contains('home-tegel-gevaar'),
      tag: t.tagName,
    })),
  }));
  return { groepen, titel: document.querySelector('#p-beheer .page-title')?.textContent.trim() };
});
const alleTegels = beheer.groepen.flatMap(g => g.tegels);
ok('pagina heet Beheer', beheer.titel === 'Beheer', beheer.titel);
ok('drie groepen: Gegevens, Onderhoud, Systeem',
  JSON.stringify(beheer.groepen.map(g => g.naam)) === JSON.stringify(['Gegevens', 'Onderhoud', 'Systeem']),
  beheer.groepen.map(g => g.naam).join(', '));

const verwacht = ['Controle', 'Importeer Excel', 'Exporteer Excel', 'Cloud sync',
  'Gegevenscontrole', 'Herstel uitvoeren', 'Migratie',
  'Opslagdiagnose', 'Supabase testen', 'API sleutel', 'Data wissen'];
for (const t of verwacht) ok(`beheertegel "${t}"`, alleTegels.some(x => x.titel === t));
ok('elf tegels in totaal', alleTegels.length === 11, String(alleTegels.length));
ok('Data wissen is als gevaarlijk gemarkeerd',
  alleTegels.find(t => t.titel === 'Data wissen')?.gevaar === true);
ok('alle beheertegels zijn buttons', alleTegels.every(t => t.tag === 'BUTTON'));

// bedrading: elke actie moet echt bestaan
const kapot = await page.evaluate(() => {
  const stuk = [];
  document.querySelectorAll('#p-beheer .home-tegel').forEach(t => {
    const code = t.getAttribute('onclick') || '';
    const m = code.match(/([A-Za-z_$][\w$]*)\s*\(/);
    if (!m) { stuk.push('geen aanroep: ' + code); return; }
    if (m[1] === 'getElementById') return;                 // import-file klik
    if (typeof window[m[1]] !== 'function') stuk.push(m[1]);
  });
  return stuk;
});
ok('alle beheeracties bestaan op window', kapot.length === 0, kapot.join(', ') || 'ok');

kop('5. Beheeracties werken echt (modals openen)');
for (const [titel, modal] of [
  ['Exporteer Excel', 'modal-export'], ['Cloud sync', 'modal-sync'],
  ['API sleutel', 'modal-apikey'], ['Data wissen', 'modal-wis'],
  ['Migratie', 'modal-migratie'],
]) {
  const r = await page.evaluate(t => {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
    window.nav('beheer');
    const knop = [...document.querySelectorAll('#p-beheer .home-tegel')]
      .find(x => x.querySelector('.home-tegel-titel')?.textContent.trim() === t);
    try { knop.click(); } catch (e) { return { fout: e.message }; }
    return { open: [...document.querySelectorAll('.modal-overlay.open')].map(m => m.id) };
  }, titel);
  ok(`"${titel}" opent een modal`, !r.fout && r.open.includes(modal),
    r.fout || r.open.join(',') || 'geen modal open');
}
await page.evaluate(() => document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open')));

kop('6. Controle blijft een eigen pagina en is bereikbaar via Beheer');
const ctr = await page.evaluate(() => {
  window.nav('beheer');
  const knop = [...document.querySelectorAll('#p-beheer .home-tegel')]
    .find(x => x.querySelector('.home-tegel-titel')?.textContent.trim() === 'Controle');
  knop.click();
  return { pagina: document.querySelector('.page.active')?.id, hash: location.hash };
});
ok('Controle-tegel navigeert naar de controlepagina', ctr.pagina === 'p-controle',
  `${ctr.pagina} ${ctr.hash}`);

ok('geen app-eigen console-fouten', page.appFouten().length === 0, page.appFouten().join(' | ') || 'geen');
await page.close();

// ───────────────────────────────────────────────── layout beheer
kop('7. Beheerpagina op smalle schermen');
for (const w of [320, 375, 1280]) {
  const p2 = await open('', w);
  const r = await p2.evaluate(() => {
    window.nav('beheer');
    const wrap = document.querySelector('.page-wrap').getBoundingClientRect();
    const rasters = [...document.querySelectorAll('#p-beheer .home-tegels')];
    const past = rasters.every(g => g.scrollWidth <= g.clientWidth + 1
      && g.getBoundingClientRect().width <= wrap.width + 1);
    const buiten = [...document.querySelectorAll('#p-beheer .home-tegel')]
      .filter(t => { const q = t.getBoundingClientRect(); return q.left < wrap.left - .5 || q.right > wrap.right + .5; }).length;
    return { past, buiten, n: rasters.length };
  });
  ok(`${String(w).padStart(4)}px: alle beheertegels passen`, r.past && r.buiten === 0,
    `past=${r.past} buiten=${r.buiten}`);
  await p2.close();
}

await browser.close();
console.log('\n' + '='.repeat(56));
console.log(fails.length ? `${fails.length} FAIL(S):\n - ${fails.join('\n - ')}` : 'ALLES PASS');
console.log('='.repeat(56));
process.exit(fails.length ? 1 : 0);
