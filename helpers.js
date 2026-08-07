// helpers.js — pure hulpfuncties en constanten (grootboek-namen, formattering,
// badges). Geen afhankelijkheden van andere modules.

export const GBNM = {
  '600':'Privé storting','601':'Privé opname',
  '4235':'Kleine aanschaf inv.','4290':'Overige zakelijke aank.','4350':'Bankkosten',
  '4760':'Abonnement','4810':'Reclame','4815':'Website','4895':'Overige verkoopkosten',
  '7000':'Inkoop AliExpress','7010':'Inkoop HNVI','7020':'Inkoop MijnMagie',
  '7100':'Inkoop verzendartikelen','7900':'Transportkosten',
  '8000':'Omzet Xtenate','8010':'Omzet Bol.com','8020':'Omzet Helmetstore'
};

export const REKNM = {'1009':'Revolut','1010':'Rabobank','1020':'Paypal','1030':'Creditkaart','1090':'Kruisposten'};

export function isIban(str) {
  return typeof str === 'string' && /^[A-Z]{2}\d{2}[A-Z0-9]{4,}\d*$/.test(str.trim());
}

export function weergaveNaam(t) {
  if (!isIban(t.naam)) return t.naam || '';
  // naam is een IBAN: probeer een echte naam te vinden in omschr (vaak "IBAN:NAAM:rest")
  if (t.omschr) {
    const delen = t.omschr.split(':');
    if (delen.length >= 2 && delen[1].trim()) return delen[1].trim();
    // geen dubbele punt structuur: gebruik omschr zelf als die geen lange code is
    if (t.omschr.length < 60 && !/\d{6,}/.test(t.omschr)) return t.omschr;
  }
  return t.naam; // laatste redmiddel: toch de IBAN
}

export const REK_COLOR = {'1010':'badge-blue','1009':'badge-purple','1030':'badge-amber','1020':'badge-green','1090':'badge-gray'};

export const MAANDEN = {'2026-01':'jan','2026-02':'feb','2026-03':'mrt','2026-04':'apr','2026-05':'mei','2026-06':'jun'};

export const PRIJS_COVER = 31.95;

export const BEGINSALDO_2026 = 183.15;

export const fmt = n => '€\u202f' + Number(n).toLocaleString('nl-NL', {minimumFractionDigits:2, maximumFractionDigits:2});

export const ddmm = d => d.slice(8,10) + '-' + d.slice(5,7);

export const isOmzet = gb => ['8000','8010','8020'].includes(gb);

export const isUitgave = t => t.type === 'uitgave';

export const isInkomst = t => t.type === 'inkomst';

export function rekBadge(rek) {
  return `<span class="badge ${REK_COLOR[rek]||'badge-gray'}">${REKNM[rek]||rek}</span>`;
}

export function typeBadge(type, bedrag) {
  if (type === 'inkomst') return `<span class="pos">+${fmt(bedrag)}</span>`;
  if (type === 'prive_storting') return `<span class="pos">+${fmt(bedrag)}</span>`;
  if (type === 'prive_opname') return `<span class="neg">–${fmt(bedrag)}</span>`;
  return `<span class="neg">–${fmt(bedrag)}</span>`;
}

// ---------- Toevoegingen fase 2026-08 ----------

export const MND_KORT = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];

/** "2026-03" -> "mrt 26" */
export function maandLabel(ym) {
  const [j, m] = ym.split('-');
  return `${MND_KORT[parseInt(m,10)-1] || m} ${j.slice(2)}`;
}

/** Korte bedragnotatie voor asvlakken: € 1,2k */
export const fmtKort = n => {
  const a = Math.abs(n);
  if (a >= 1000) return '€' + (n/1000).toFixed(a >= 10000 ? 0 : 1).replace('.', ',') + 'k';
  return '€' + Math.round(n);
};

/** Voorkomt dat data uit een import als HTML wordt uitgevoerd. */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/**
 * Indicatieve inkomstenbelasting box 1 voor een eenmanszaak.
 * MKB-winstvrijstelling 14,2%; schijf 1 36,97% tot € 38.441, daarboven 49,5%.
 * Bij verlies wordt een mogelijke teruggave (negatief bedrag) teruggegeven.
 */
export function calcIB(winst) {
  if (winst <= 0) return winst * 0.3697;
  const mkb = winst * 0.142;
  const belastbaar = Math.max(0, winst - mkb);
  return belastbaar <= 38441
    ? belastbaar * 0.3697
    : 38441 * 0.3697 + (belastbaar - 38441) * 0.495;
}

/** Percentage van de winst dat je opzij zou moeten zetten voor de IB. */
export const RESERVE_PCT = 0.30;

/** Effect van een boeking op het banksaldo. */
export function saldoDelta(t) {
  if (t.type === 'inkomst' || t.type === 'prive_storting') return t.bedrag;
  return -t.bedrag;
}

/** Vult een maandkeuzelijst op basis van de datums die in de data voorkomen. */
export function vulMaandSelect(select, boekingen) {
  if (!select) return;
  const gekozen = select.value;
  const maanden = [...new Set(boekingen.map(t => t.datum.slice(0, 7)))].sort().reverse();
  select.innerHTML = '<option value="">Alle maanden</option>' +
    maanden.map(m => `<option value="${m}"${m === gekozen ? ' selected' : ''}>${maandLabel(m)}</option>`).join('');
}

/**
 * Voert een functie pas uit als er even niets meer is getypt. Zonder dit wordt
 * bij elke toetsaanslag de hele tabel opnieuw opgebouwd.
 */
export function vertraag(fn, ms = 160) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/** Standaard leeg-vlak, zodat elke pagina er hetzelfde uitziet. */
export function leegVlak(titel, tekst, knop = '') {
  return `<div class="empty">
    <div class="empty-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg></div>
    <div class="empty-title">${esc(titel)}</div>
    <div class="empty-text">${esc(tekst)}</div>
    ${knop}
  </div>`;
}

/**
 * Leest een bedrag uit een invoerveld. Accepteert zowel 12,50 als 12.50 —
 * bedragvelden zijn tekstvelden, omdat een getalveld in de browser stilzwijgend
 * een komma weigert en dan gewoon leeg lijkt.
 */
export function bedragUit(id, standaard = 0) {
  const veld = document.getElementById(id);
  if (!veld) return standaard;
  const n = parseFloat(String(veld.value).trim().replace(/\s/g, '').replace(',', '.'));
  return isNaN(n) ? standaard : n;
}
