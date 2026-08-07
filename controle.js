// controle.js — Controle: loopt de administratie na op gaten en tegenstrijdigheden.
//
// Elke controle levert hetzelfde soort uitkomst op, zodat de pagina ze allemaal
// gelijk kan tonen en de samenvatting simpelweg kan tellen:
//   { sectie, titel, ok, uitleg, items: [{ label, sub, ga }] }
// `ga` bepaalt waar je heen springt als je op een regel klikt:
//   'tx:<id>'  -> detailpaneel van die boeking
//   'gb:<nr>'  -> die grootboekrekening
//   'pagina:<naam>' -> die pagina

import { BEGINSALDO_2026, GBNM, REKNM, esc, fmt, teltBij, weergaveNaam } from './helpers.js?v=20260806a';
import { MAAND_SALDOS, state } from './storage.js?v=20260806a';

const el = id => document.getElementById(id);
const HOOFDREKENING = '1010';

/** Sleutel waarop twee boekingen als duplicaat gelden. */
const dubbelSleutel = t => [t.datum, t.bedrag, t.naam, t.gb, t.rek].join('|');

function txLabel(t) {
  return `${t.datum} · ${weergaveNaam(t) || '(geen naam)'} · ${fmt(t.bedrag)}`;
}

/** Bouwt één controle-uitkomst. */
function check(sectie, titel, items, uitleg, geenProbleemTekst) {
  return { sectie, titel, ok: items.length === 0, items, uitleg, geenProbleemTekst };
}

// ------------------------------------------------------------- de controles

function bepaalBron() {
  const jaar = el('f-controle-jaar') ? el('f-controle-jaar').value : 'all';
  if (jaar === 'all') return { tx: [...state.HIST_TX, ...state.TX], jaar };
  if (jaar === '2026') return { tx: state.TX, jaar };
  return { tx: state.HIST_TX.filter(t => t.datum.startsWith(jaar)), jaar };
}

function controlesBoekingen(tx) {
  const uit = [];

  uit.push(check('Boekingen', 'Alle boekingen hebben een datum',
    tx.filter(t => !/^\d{4}-\d{2}-\d{2}$/.test(t.datum || ''))
      .map(t => ({ label: `${weergaveNaam(t) || '(geen naam)'} · ${fmt(t.bedrag)}`, sub: `datum: ${t.datum || 'leeg'}`, ga: `tx:${t.id}` })),
    'Zonder geldige datum valt een boeking buiten elk jaar- en maandoverzicht.'));

  const vandaag = new Date().toISOString().slice(0, 10);
  uit.push(check('Boekingen', 'Geen boekingen met een datum in de toekomst',
    tx.filter(t => t.datum > vandaag).map(t => ({ label: txLabel(t), sub: 'ligt na vandaag', ga: `tx:${t.id}` })),
    'Een datum in de toekomst wijst meestal op een typefout in het jaartal.'));

  uit.push(check('Boekingen', 'Geen lege of negatieve bedragen',
    tx.filter(t => !(Number(t.bedrag) > 0))
      .map(t => ({ label: `${t.datum} · ${weergaveNaam(t) || '(geen naam)'}`, sub: `bedrag: ${fmt(t.bedrag || 0)}`, ga: `tx:${t.id}` })),
    'Of een bedrag bij- of afgaat volgt uit de soort mutatie, dus het bedrag zelf hoort altijd groter dan nul te zijn.'));

  uit.push(check('Boekingen', 'Alle boekingen hebben een grootboekrekening',
    tx.filter(t => !t.gb).map(t => ({ label: txLabel(t), sub: 'geen grootboekrekening', ga: `tx:${t.id}` })),
    'Zonder grootboekrekening telt een boeking nergens in mee — niet in de omzet, niet in de kosten.'));

  // Nummers die wel ingevuld zijn maar niet in het schema staan
  const onbekend = {};
  tx.filter(t => t.gb && !GBNM[t.gb]).forEach(t => { (onbekend[t.gb] ||= []).push(t); });
  uit.push(check('Boekingen', 'Alle gebruikte grootboekrekeningen staan in het schema',
    Object.entries(onbekend).map(([gb, lijst]) => ({
      label: `Rekening ${gb}`,
      sub: `${lijst.length} boeking${lijst.length === 1 ? '' : 'en'} · samen ${fmt(lijst.reduce((s, t) => s + t.bedrag, 0))}`,
      ga: `gb:${gb}`
    })),
    'Deze nummers komen in je boekingen voor maar hebben geen naam in de app. Ze verschijnen overal als "Onbekende rekening".'));

  uit.push(check('Boekingen', 'Alle boekingen staan op een bekende bankrekening',
    tx.filter(t => !t.rek || !REKNM[t.rek])
      .map(t => ({ label: txLabel(t), sub: `rekening: ${t.rek || 'leeg'}`, ga: `tx:${t.id}` })),
    'Een onbekende rekening laat de mutatie uit de saldo-overzichten vallen.'));

  const gezien = new Map();
  const duplicaten = [];
  tx.forEach(t => {
    const sleutel = dubbelSleutel(t);
    if (gezien.has(sleutel)) duplicaten.push({ eerste: gezien.get(sleutel), tweede: t });
    else gezien.set(sleutel, t);
  });
  uit.push(check('Boekingen', 'Geen dubbele boekingen',
    duplicaten.map(d => ({ label: txLabel(d.tweede), sub: 'zelfde datum, bedrag, naam, grootboek en rekening', ga: `tx:${d.tweede.id}` })),
    'Identieke regels zijn vaak een dubbele import. Soms klopt het wel — twee keer hetzelfde pakket versturen op één dag komt voor.'));

  const ids = new Map();
  const dubbeleIds = [];
  tx.forEach(t => {
    if (ids.has(String(t.id))) dubbeleIds.push(t); else ids.set(String(t.id), t);
  });
  uit.push(check('Boekingen', 'Elk boekingsnummer is uniek',
    dubbeleIds.map(t => ({ label: txLabel(t), sub: `nummer ${t.id} komt meer dan één keer voor`, ga: `tx:${t.id}` })),
    'Twee boekingen met hetzelfde nummer kunnen elkaar bij bewerken overschrijven.'));

  return uit;
}

function controlesPrive(tx) {
  const uit = [];

  uit.push(check('Privé', 'Privé-opnames correct geboekt',
    tx.filter(t => (t.type === 'prive_opname') !== (t.gb === '601'))
      .map(t => ({ label: txLabel(t), sub: `soort "${t.type}" bij grootboek ${t.gb}`, ga: `tx:${t.id}` })),
    'Soort en grootboekrekening moeten samen kloppen: een opname is type prive_opname én rekening 601.'));

  uit.push(check('Privé', 'Privé-stortingen correct geboekt',
    tx.filter(t => (t.type === 'prive_storting') !== (t.gb === '600'))
      .map(t => ({ label: txLabel(t), sub: `soort "${t.type}" bij grootboek ${t.gb}`, ga: `tx:${t.id}` })),
    'Loopt dit uiteen, dan telt een storting mee als opname of andersom, en klopt je privé-saldo niet.'));

  return uit;
}

function controlesRichting(tx) {
  const uit = [];

  uit.push(check('Boekingen', 'Omzet staat als inkomst geboekt',
    tx.filter(t => String(t.gb).startsWith('8') && t.type === 'uitgave')
      .map(t => ({ label: txLabel(t), sub: `${GBNM[t.gb] || t.gb} maar geboekt als uitgave`, ga: `tx:${t.id}` })),
    'Een omzetrekening met een uitgave erop is meestal een terugbetaling of een verkeerd gekozen soort. Klopt het wel, boek het dan op een aparte rekening.'));

  uit.push(check('Boekingen', 'Kosten en inkoop staan als uitgave geboekt',
    tx.filter(t => (String(t.gb).startsWith('7') || String(t.gb).startsWith('4')) && t.type === 'inkomst')
      .map(t => ({ label: txLabel(t), sub: `${GBNM[t.gb] || t.gb} maar geboekt als inkomst`, ga: `tx:${t.id}` })),
    'Een kostenrekening met een inkomst erop is meestal een creditnota of retour. Dat mag, maar het drukt wel je kosten.'));

  return uit;
}

function controlesAansluiting(tx, jaar) {
  const uit = [];

  // Overboekingen tussen eigen rekeningen horen per saldo op nul uit te komen.
  const kruis = tx.filter(t => t.gb === '2000' || t.gb === '1090');
  const kruisSaldo = kruis.reduce((s, t) => s + (teltBij(t) ? t.bedrag : -t.bedrag), 0);
  uit.push(check('Aansluiting', 'Overboekingen tussen eigen rekeningen vallen tegen elkaar weg',
    kruis.length && Math.abs(kruisSaldo) > 0.01
      ? [{ label: `Verschil ${fmt(kruisSaldo)}`, sub: `over ${kruis.length} overboekingen`, ga: 'gb:2000' }]
      : [],
    'Geld dat je van je ene naar je andere rekening schuift, hoort twee keer in de administratie te staan: eraf én erop. Blijft er een verschil over, dan mist er een kant.'));

  // Berekend saldo naast het saldo dat de bank opgeeft
  const eind2026 = BEGINSALDO_2026 + state.TX
    .filter(t => t.rek === HOOFDREKENING)
    .reduce((s, t) => s + (teltBij(t) ? t.bedrag : -t.bedrag), 0);
  const maandenMetSaldo = Object.keys(MAAND_SALDOS).sort();
  const laatste = maandenMetSaldo[maandenMetSaldo.length - 1];
  const items = [];
  if (jaar !== 'all' && jaar !== '2026' && laatste && laatste.startsWith(jaar)) {
    // Voor een afgesloten jaar vergelijken we het opgetelde jaar met het bankeindsaldo.
    const eersteMaand = maandenMetSaldo.find(m => m.startsWith(jaar));
    const begin = eersteMaand ? MAAND_SALDOS[eersteMaand].begin : null;
    if (begin != null) {
      const mutaties = tx.filter(t => t.rek === HOOFDREKENING)
        .reduce((s, t) => s + (teltBij(t) ? t.bedrag : -t.bedrag), 0);
      const verschil = (begin + mutaties) - MAAND_SALDOS[laatste].eind;
      if (Math.abs(verschil) > 0.01) {
        items.push({
          label: `Verschil ${fmt(verschil)} over ${jaar}`,
          sub: `berekend ${fmt(begin + mutaties)} tegenover ${fmt(MAAND_SALDOS[laatste].eind)} volgens de bank`,
          ga: 'pagina:bank'
        });
      }
    }
  }
  uit.push(check('Aansluiting', 'Banksaldo sluit aan op de bankafschriften', items,
    'Het saldo dat volgt uit je boekingen wordt vergeleken met het saldo dat de bank opgeeft. Loopt dat uiteen, dan mist er een mutatie of staat er een dubbel.',
    jaar === 'all' || jaar === '2026'
      ? `Berekend saldo Rabobank: ${fmt(eind2026)}. Kies een afgesloten jaar om te vergelijken met de bank.`
      : null));

  return uit;
}

function controlesVoorraad() {
  const uit = [];
  const artikelen = state.COVERS;

  uit.push(check('Voorraad', 'Geen negatieve voorraad',
    artikelen.filter(c => Number(c.voorraad) < 0)
      .map(c => ({ label: c.artikel, sub: `voorraad ${c.voorraad}`, ga: 'pagina:voorraad' })),
    'Een negatieve voorraad betekent dat er meer verkocht is dan ingekocht, of dat een mutatie ontbreekt.'));

  uit.push(check('Voorraad', 'Alle artikelen hebben een kostprijs',
    artikelen.filter(c => c.inkoopprijs == null || c.inkoopprijs === '')
      .map(c => ({ label: c.artikel, sub: 'geen inkoopprijs ingevuld', ga: 'pagina:voorraad' })),
    'Zonder inkoopprijs kan de voorraadwaarde niet worden berekend, en die heb je nodig voor je balans en je aangifte.'));

  uit.push(check('Voorraad', 'Alle artikelen zitten in een productgroep',
    artikelen.filter(c => !c.categorie || !state.GROEPEN.some(g => g.id === c.categorie))
      .map(c => ({ label: c.artikel, sub: `groep: ${c.categorie || 'leeg'}`, ga: 'pagina:voorraad' })),
    'Artikelen zonder geldige groep vallen buiten elk tabblad behalve Overzicht.'));

  const namen = new Map();
  const dubbel = [];
  artikelen.forEach(c => {
    const sleutel = String(c.artikel || '').trim().toLowerCase();
    if (!sleutel) return;
    if (namen.has(sleutel)) dubbel.push(c); else namen.set(sleutel, c);
  });
  uit.push(check('Voorraad', 'Geen dubbele artikelnamen',
    dubbel.map(c => ({ label: c.artikel, sub: 'komt meer dan één keer voor', ga: 'pagina:voorraad' })),
    'Twee regels met dezelfde naam splitsen je voorraad en zorgen dat een import de verkeerde regel bijwerkt.'));

  uit.push(check('Voorraad', 'Ingekocht min verkocht komt uit op de voorraad',
    artikelen.filter(c => {
      const ink = Number(c.inkoop) || 0, vk = Number(c.verkoop) || 0;
      return (ink > 0 || vk > 0) && ink - vk !== Number(c.voorraad);
    }).map(c => ({
      label: c.artikel,
      sub: `${c.inkoop || 0} ingekocht − ${c.verkoop || 0} verkocht = ${(Number(c.inkoop) || 0) - (Number(c.verkoop) || 0)}, maar voorraad staat op ${c.voorraad}`,
      ga: 'pagina:voorraad'
    })),
    'Klopt dit niet, dan is er iets verkocht of ingekocht zonder dat de voorraad is bijgewerkt. Een correctie na een telling is een geldige reden voor een verschil.'));

  return uit;
}

function controlesHnvi() {
  const uit = [];
  const loten = state.HNVI_LOTS;

  uit.push(check('HNVI', 'Alle loten hebben een inkoopbedrag',
    loten.filter(l => !(Number(l.inkoop) > 0))
      .map(l => ({ label: l.omschr || 'Lot zonder omschrijving', sub: `inkoop: ${fmt(l.inkoop || 0)}`, ga: 'pagina:hnvi' })),
    'Zonder inkoopbedrag telt een lot niet mee in de voorraadwaarde en kan de marge niet worden berekend.'));

  uit.push(check('HNVI', 'Verkochte loten hebben een verkoopbedrag',
    loten.filter(l => l.status === 'verkocht' && !(Number(l.verkoop) > 0))
      .map(l => ({ label: l.omschr || 'Lot zonder omschrijving', sub: 'staat op verkocht maar zonder bedrag', ga: 'pagina:hnvi' })),
    'Een verkocht lot zonder bedrag verlaagt je omzet en vertekent de marge.'));

  uit.push(check('HNVI', 'Loten in voorraad hebben nog geen verkoopbedrag',
    loten.filter(l => l.status !== 'verkocht' && Number(l.verkoop) > 0)
      .map(l => ({ label: l.omschr || 'Lot zonder omschrijving', sub: `staat op voorraad maar heeft ${fmt(l.verkoop)} verkoop`, ga: 'pagina:hnvi' })),
    'Waarschijnlijk is het lot wel verkocht maar niet als verkocht gemarkeerd.'));

  uit.push(check('HNVI', 'Alle loten hebben een datum',
    loten.filter(l => !/^\d{4}-\d{2}-\d{2}$/.test(l.datum || ''))
      .map(l => ({ label: l.omschr || 'Lot zonder omschrijving', sub: `datum: ${l.datum || 'leeg'}`, ga: 'pagina:hnvi' })),
    'Zonder datum valt een lot buiten de jaaroverzichten.'));

  return uit;
}

/** Voert alle controles uit voor de gekozen periode. */
export function draaiControles() {
  const { tx, jaar } = bepaalBron();
  return [
    ...controlesBoekingen(tx),
    ...controlesRichting(tx),
    ...controlesPrive(tx),
    ...controlesAansluiting(tx, jaar),
    ...controlesVoorraad(),
    ...controlesHnvi()
  ];
}

// -------------------------------------------------------------------- render

const VINK = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
const WAARSCHUW = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/></svg>';

function renderRegel(c, index) {
  const aantal = c.items.length;
  return `
    <div class="ctrl-regel ${c.ok ? 'is-ok' : 'is-let-op'}">
      <button class="ctrl-kop" ${aantal ? `onclick="klapControleUit(${index})" aria-expanded="false" aria-controls="ctrl-detail-${index}"` : 'disabled'}>
        <span class="ctrl-icoon">${c.ok ? VINK : WAARSCHUW}</span>
        <span class="ctrl-titel">${esc(c.titel)}</span>
        ${aantal
          ? `<span class="badge badge-amber">${aantal} ${aantal === 1 ? 'regel' : 'regels'}</span>
             <span class="ctrl-pijl" aria-hidden="true">
               <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
             </span>`
          : `<span class="ctrl-goed">in orde</span>`}
      </button>
      <div class="ctrl-detail" id="ctrl-detail-${index}" hidden>
        <p class="ctrl-uitleg">${esc(c.uitleg)}</p>
        ${aantal
          ? `<div class="ctrl-items">${c.items.slice(0, 25).map(i => `
              <button class="ctrl-item" data-ga="${esc(i.ga)}">
                <span class="ctrl-item-main">
                  <span class="ctrl-item-label">${esc(i.label)}</span>
                  <span class="ctrl-item-sub">${esc(i.sub)}</span>
                </span>
                <span class="ctrl-item-ga">Bekijken →</span>
              </button>`).join('')}
              ${aantal > 25 ? `<div class="ctrl-meer">en nog ${aantal - 25} andere</div>` : ''}
            </div>`
          : ''}
      </div>
    </div>`;
}

let laatsteResultaten = [];

export function klapControleUit(index) {
  const detail = el(`ctrl-detail-${index}`);
  if (!detail) return;
  const open = !detail.hidden;
  detail.hidden = open;
  detail.previousElementSibling.setAttribute('aria-expanded', String(!open));
  detail.parentElement.classList.toggle('is-open', !open);
}

export function renderControle() {
  laatsteResultaten = draaiControles();

  const totaal = laatsteResultaten.length;
  const geslaagd = laatsteResultaten.filter(c => c.ok).length;
  const letOp = totaal - geslaagd;
  const regels = laatsteResultaten.reduce((s, c) => s + c.items.length, 0);

  el('controle-kpi').innerHTML = `
    <div class="kpi">
      <div class="kpi-lbl">Controles uitgevoerd</div>
      <div class="kpi-val">${totaal}</div>
      <div class="kpi-sub">over boekingen, voorraad en HNVI</div>
    </div>
    <div class="kpi">
      <div class="kpi-lbl">Geslaagd</div>
      <div class="kpi-val pos">${geslaagd}</div>
      <div class="kpi-sub">niets gevonden om na te kijken</div>
    </div>
    <div class="kpi">
      <div class="kpi-lbl">Aandachtspunten</div>
      <div class="kpi-val ${letOp ? 'neg' : 'pos'}">${letOp}</div>
      <div class="kpi-sub">${letOp ? `${regels} regel${regels === 1 ? '' : 's'} om te bekijken` : 'alles in orde'}</div>
    </div>
    <div class="kpi">
      <div class="kpi-lbl">Status</div>
      <div class="kpi-val ${letOp ? 'neg' : 'pos'}" style="font-size:19px">${letOp ? 'Nakijken' : 'Schoon'}</div>
      <div class="kpi-sub">${letOp ? 'klik een punt open voor de regels' : 'geen actie nodig'}</div>
    </div>`;

  // Aandachtspunten eerst; binnen elke groep de volgorde van de controles zelf.
  const gesorteerd = [...laatsteResultaten].sort((a, b) => Number(a.ok) - Number(b.ok));
  const secties = [...new Set(gesorteerd.map(c => c.sectie))];

  el('controle-lijst').innerHTML = secties.map(sectie => {
    const inSectie = gesorteerd.filter(c => c.sectie === sectie);
    const open = inSectie.filter(c => !c.ok).length;
    return `
      <div class="section-head">
        <div class="eyebrow">${esc(sectie)}</div>
        <div class="muted" style="font-size:11.5px">${open ? `${open} aandachtspunt${open === 1 ? '' : 'en'}` : 'in orde'}</div>
      </div>
      <div class="card card-flush">
        ${inSectie.map(c => renderRegel(c, laatsteResultaten.indexOf(c))).join('')}
      </div>`;
  }).join('');

  const notitie = laatsteResultaten.find(c => c.geenProbleemTekst && c.ok);
  el('controle-notitie').innerHTML = notitie
    ? `<div class="alert alert-info">${esc(notitie.geenProbleemTekst)}</div>`
    : '';
}
