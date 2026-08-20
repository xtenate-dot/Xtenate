// belasting.js — Belasting-pagina (indicatieve IB-berekening).

import { charts, dc , palette } from './charts.js?v=20260812c';
import { GBNM, fmt, isInkomst, isOmzet, isUitgave } from './helpers.js?v=20260812c';
import { state } from './storage.js?v=20260812c';

const HUIDIG_JAAR = '2026';

/** Sleutel waaronder de handmatige posten van één jaar staan opgeslagen. */
const kostenSleutel = jaar => `xtenate_aangifte_extra_${jaar}`;

/** Handmatige aftrekposten van een jaar; bij een lege of stukke opslag een lege lijst. */
export function handmatigeKosten(jaar) {
  try {
    const ruw = JSON.parse(localStorage.getItem(kostenSleutel(jaar)) || '[]');
    return Array.isArray(ruw) ? ruw.slice(0, 5) : [];
  } catch {
    return [];
  }
}

export function renderBelasting() {
  const jaar = document.getElementById('f-jaar-bel') ? document.getElementById('f-jaar-bel').value : '2026';
  const belTX = jaar === 'all' ? [...state.HIST_TX, ...state.TX] : (jaar === '2026' ? state.TX : state.HIST_TX.filter(t => t.datum.startsWith(jaar)));

  // Update card title
  const ct = document.getElementById('bel-card-title');
  if (ct) ct.textContent = `Berekening box 1 — indicatie ${jaar === 'all' ? 'alle jaren' : jaar}`;

  const omzet = belTX.filter(t => isInkomst(t) && isOmzet(t.gb)).reduce((s,t)=>s+t.bedrag,0);

  // Alle overige kosten (niet 7010 = HNVI inkoop)
  const kostenOverig = belTX.filter(t => isUitgave(t) && t.gb !== '7010').reduce((s,t)=>s+t.bedrag,0);

  // HNVI inkoop: filter op jaar van het lot (via datum)
  const hnviJaar = jaar === 'all' ? state.HNVI_LOTS : state.HNVI_LOTS.filter(i => i.datum && i.datum.startsWith(jaar));
  const hnviVerkocht = hnviJaar.filter(i => i.status === 'verkocht').reduce((s,i)=>s+(Number(i.inkoop)||0),0);
  const hnviVoorraad = hnviJaar.filter(i => i.status === 'voorraad').reduce((s,i)=>s+(Number(i.inkoop)||0),0);
  const hnviVoorraadAantal = hnviJaar.filter(i => i.status === 'voorraad').length;
  // Totale 7010 in bank (fallback als geen loten voor dit jaar)
  const hnviTotaalBank = belTX.filter(t => isUitgave(t) && t.gb === '7010').reduce((s,t)=>s+(Number(t.bedrag)||0),0);
  const hnviAftrekbaar = hnviJaar.length > 0 ? hnviVerkocht : hnviTotaalBank;
  // Voorraad van dit jaar = nog niet aftrekbaar
  const hnviNietAftrekbaar = hnviVoorraad;

  // Voorraadartikelen tellen pas als kosten in het jaar dat ze verkocht zijn.
  // Koop je iets in 2025 en verkoop je het in 2026, dan valt de inkoopprijs in
  // 2026. Wat op 31 december nog op de plank ligt is geen kostenpost maar een
  // bezitting, en staat hieronder apart als eindvoorraad.
  const voorraadCogs = (state.COVERS || []).reduce((som, art) => {
    const prijs = Number(art.inkoopprijs ?? art.inkoop ?? 0);
    if (!(prijs > 0)) return som;                 // zonder inkoopprijs niets te rekenen
    if (jaar === 'all') {
      const alle = Object.values(art.jaren || {})
        .reduce((n, j) => n + (Number(j?.verkocht) || 0), 0);
      return som + prijs * alle;
    }
    return som + prijs * (Number(art.jaren?.[jaar]?.verkocht) || 0);
  }, 0);

  // Waarde van wat er aan het eind van het jaar nog ligt (balanspost, geen kosten).
  const voorraadEind = (state.COVERS || []).reduce((som, art) => {
    const prijs = Number(art.inkoopprijs ?? art.inkoop ?? 0);
    if (!(prijs > 0)) return som;
    const aantal = jaar === 'all' || jaar === HUIDIG_JAAR
      ? Number(art.voorraad) || 0
      : Number(art.jaren?.[jaar]?.eind ?? 0);
    return som + prijs * aantal;
  }, 0);

  // Handmatige posten (huur, rente, verzekering) uit de kostenmodal.
  const handmatig = handmatigeKosten(jaar);
  const handmatigTotaal = handmatig.reduce((s, k) => s + (Number(k.bedrag) || 0), 0);

  const kostenAftrekbaar = kostenOverig + hnviAftrekbaar + voorraadCogs + handmatigTotaal;
  const winst = omzet - kostenAftrekbaar;

  // Jaarprojectie op basis van huidige maanden
  const maandenMet = [...new Set(belTX.filter(t=>isInkomst(t)&&isOmzet(t.gb)).map(t=>t.datum.slice(0,7)))].length || 1;
  const omzetPerMaand = omzet / maandenMet;
  const kostenPerMaand = kostenAftrekbaar / maandenMet;
  const omzetJaar = Math.round(omzetPerMaand * 12);
  const kostenJaar = Math.round(kostenPerMaand * 12);
  const winstJaar = omzetJaar - kostenJaar;

  // IB berekening (huidig)
  const calcIB = (w) => {
    if (w <= 0) return w * 0.3697; // negatief = mogelijke teruggave
    const mkb = w * 0.142;
    const belastbaar = Math.max(0, w - mkb);
    return belastbaar <= 38441 ? belastbaar * 0.3697 : 38441 * 0.3697 + (belastbaar-38441) * 0.495;
  };
  const ib = calcIB(winst);
  const ibJaar = calcIB(winstJaar);
  const mkb = winst > 0 ? Math.round(winst * 0.142) : 0;
  const belastbaar = winst > 0 ? Math.max(0, winst - mkb) : 0;

  document.getElementById('bel-metrics').innerHTML = `
    <div class="metric"><div class="lbl">Bruto omzet</div><div class="val">${fmt(omzet)}</div></div>
    <div class="metric"><div class="lbl">Aftrekbare kosten</div><div class="val neg">${fmt(kostenAftrekbaar)}</div></div>
    <div class="metric"><div class="lbl">Winst / verlies</div><div class="val ${winst>=0?'pos':'neg'}">${fmt(winst)}</div></div>
    <div class="metric"><div class="lbl">${ib<=0?'Geschatte teruggave':'Geschatte IB'}</div><div class="val ${ib<=0?'pos':'neg'}">${ib<=0?'+':''}${fmt(Math.abs(Math.round(ib)))}</div></div>
    <div class="metric"><div class="lbl">HNVI voorraad (niet aftrekbaar)</div><div class="val" style="color:var(--text-muted)">${fmt(hnviNietAftrekbaar)}</div><div class="sub">${hnviVoorraadAantal} loten nog in voorraad</div></div>
    <div class="metric"><div class="lbl">Voorraad eind ${jaar === 'all' ? 'nu' : jaar}</div><div class="val" style="color:var(--text-muted)">${fmt(voorraadEind)}</div><div class="sub">bezitting, geen kostenpost</div></div>
    <div class="metric"><div class="lbl">Projectie heel jaar</div><div class="val ${winstJaar>=0?'pos':'neg'}">${fmt(winstJaar)}</div><div class="sub">op basis van ${maandenMet} mnd</div></div>`;

  const teruggaveRegel = ib < 0 ? `
    <div style="background:var(--green-bg);border:1px solid color-mix(in srgb, var(--green) 25%, transparent);border-radius:6px;padding:.625rem .875rem;margin-top:.75rem;font-size:12px;color:var(--green)">
      💡 Bij verlies kun je dit verrekenen met ander inkomen (bijv. loon). Geschatte teruggave: <strong>${fmt(Math.abs(Math.round(ib)))}</strong> — bespreek dit met je belastingadviseur.
    </div>` : '';

  const hnviWaarschuwing = hnviNietAftrekbaar > 0 ? `
    <div style="background:var(--amber-bg);border:1px solid color-mix(in srgb, var(--amber) 25%, transparent);border-radius:6px;padding:.625rem .875rem;margin-top:.75rem;font-size:12px;color:var(--amber)">
      ⚠ ${fmt(hnviNietAftrekbaar)} HNVI inkoop is nog niet aftrekbaar (voorraad). Zodra je die loten verkoopt in de HNVI-tab wordt dit automatisch aangepast.
    </div>` : (state.HNVI_LOTS.length === 0 ? `
    <div style="background:var(--amber-bg);border:1px solid color-mix(in srgb, var(--amber) 25%, transparent);border-radius:6px;padding:.625rem .875rem;margin-top:.75rem;font-size:12px;color:var(--amber)">
      ⚠ Voeg je HNVI-loten toe in de HNVI-tab zodat de belasting correct wordt berekend. Nu wordt alle 7010 inkoop als aftrekbaar beschouwd.
    </div>` : '');

  document.getElementById('bel-calc').innerHTML = `
    <div class="ib-row"><span>Bruto omzet</span><span>${fmt(omzet)}</span></div>
    <div class="ib-row"><span>Overige kosten & inkoop</span><span class="neg">– ${fmt(kostenOverig)}</span></div>
    <div class="ib-row"><span>HNVI inkoop (verkochte loten)</span><span class="neg">– ${fmt(hnviAftrekbaar)}</span></div>
    <div class="ib-row"><span>Voorraad (inkoopprijs verkochte artikelen)</span><span class="neg">– ${fmt(voorraadCogs)}</span></div>
    ${handmatig.map(k => `<div class="ib-row"><span>${escHtml(k.label) || 'Overige post'}</span><span class="neg">– ${fmt(Number(k.bedrag) || 0)}</span></div>`).join('')}
    <div class="ib-row" style="color:var(--text-muted);font-size:11px"><span>HNVI inkoop (voorraad, niet aftrekbaar)</span><span>${fmt(hnviNietAftrekbaar)}</span></div>
    <div class="ib-row" style="color:var(--text-muted);font-size:11px"><span>Voorraad nog op de plank (bezitting)</span><span>${fmt(voorraadEind)}</span></div>
    <div class="ib-row"><span style="font-weight:600">Winst / verlies</span><span style="font-weight:600" class="${winst>=0?'pos':'neg'}">${fmt(winst)}</span></div>
    ${winst > 0 ? `
    <div class="ib-row"><span>MKB-winstvrijstelling (14,2%)</span><span class="neg">– ${fmt(mkb)}</span></div>
    <div class="ib-row"><span>Belastbaar inkomen</span><span>${fmt(Math.round(belastbaar))}</span></div>
    <div class="ib-row"><span>Tarief schijf 1 (36,97%)</span><span></span></div>
    <div class="ib-total"><span>Geschatte inkomstenbelasting</span><span class="neg">${fmt(Math.round(ib))}</span></div>` : `
    <div class="ib-total"><span>${ib < 0 ? 'Geschatte teruggave (bij ander inkomen)' : 'Geen belasting verschuldigd'}</span><span class="${ib<0?'pos':''}">${ib<0?'+ '+fmt(Math.abs(Math.round(ib))):'€\u202f0,00'}</span></div>`}

    <div style="margin-top:1rem;padding-top:.75rem;border-top:1px solid var(--border);font-size:11px;color:var(--text-muted)">
      <strong>Projectie heel jaar</strong> (op basis van ${maandenMet} maanden): omzet ${fmt(omzetJaar)} · kosten ${fmt(kostenJaar)} · winst ${fmt(winstJaar)} · geschatte IB ${ibJaar<0?'teruggave '+fmt(Math.abs(Math.round(ibJaar))):fmt(Math.round(ibJaar))}
    </div>

    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:.75rem;padding-top:.75rem;border-top:1px solid var(--border)">
      <button type="button" class="btn btn-sm" onclick="openExtraKosten()">Aftrekposten aanvullen${handmatig.length ? ` (${handmatig.length})` : ''}</button>
      <button type="button" class="btn btn-sm" onclick="kopieerAangifte()">Kopieer aangifte</button>
      <button type="button" class="btn btn-sm" onclick="downloadAangifte()">Download als tekst</button>
    </div>`;

  const omzData = [
    belTX.filter(t=>isInkomst(t)&&t.gb==='8000').reduce((s,t)=>s+t.bedrag,0),
    belTX.filter(t=>isInkomst(t)&&t.gb==='8010').reduce((s,t)=>s+t.bedrag,0),
    belTX.filter(t=>isInkomst(t)&&t.gb==='8020').reduce((s,t)=>s+t.bedrag,0),
  ];
  const omzLabels = ['Xtenate (8000)','Bol.com covers (8010)','Helmetstore (8020)'];
  const colors = palette().slice(0, 3);
  dc('c-bel');
  charts['c-bel'] = new Chart(document.getElementById('c-bel'), {type:'doughnut',data:{labels:omzLabels,datasets:[{data:omzData,backgroundColor:colors,borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,cutout:'62%',plugins:{legend:{display:false}}}});
  document.getElementById('bel-legend').innerHTML = omzLabels.map((n,i)=>`<span style="display:flex;align-items:center;gap:5px"><span style="width:9px;height:9px;border-radius:2px;background:${colors[i]}"></span>${n} ${fmt(omzData[i])}</span>`).join('');

  const subkop = (tekst) => `<tr><td colspan="4" style="padding:10px 0 4px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted)">${tekst}</td></tr>`;
  const rij = (gb, bedrag, richting, label, kleur) => {
    const bg = kleur==='pos'?'var(--green-bg)':kleur==='neg'?'var(--red-bg)':'var(--gray-bg)';
    const fc = kleur==='pos'?'var(--green)':kleur==='neg'?'var(--red)':'var(--text-muted)';
    return `<tr>
      <td style="color:var(--text-muted);font-size:11px">${gb}</td>
      <td>${GBNM[gb]||gb}</td>
      <td><span style="font-size:10px;padding:2px 7px;border-radius:20px;background:${bg};color:${fc}">${label}</span></td>
      <td style="text-align:right" class="${kleur==='pos'?'pos':kleur==='neg'?'neg':''}">${richting==='plus'?'+ ':'– '}${fmt(Math.abs(bedrag))}</td>
    </tr>`;
  };

  const omzetGbs2 = [...new Set(belTX.filter(isInkomst).map(t=>t.gb))].filter(isOmzet).sort();
  const omzetRows = omzetGbs2.map(gb => {
    const tot = belTX.filter(t=>isInkomst(t)&&t.gb===gb).reduce((s,t)=>s+t.bedrag,0);
    return rij(gb, tot, 'plus', 'altijd baten', 'pos');
  }).join('');

  const r4Gbs = [...new Set(belTX.filter(isUitgave).map(t=>t.gb))].filter(g=>g.startsWith('4')).sort();
  const r4Rows = r4Gbs.map(gb => {
    const tot = belTX.filter(t=>isUitgave(t)&&t.gb===gb).reduce((s,t)=>s+t.bedrag,0);
    return rij(gb, tot, 'min', 'altijd aftrekbaar', 'neg');
  }).join('');

  const r7AltijdGbs = [...new Set(belTX.filter(isUitgave).map(t=>t.gb))].filter(g=>['7000','7020','7100','7900'].includes(g)).sort();
  const r7AltijdRows = r7AltijdGbs.map(gb => {
    const tot = belTX.filter(t=>isUitgave(t)&&t.gb===gb).reduce((s,t)=>s+t.bedrag,0);
    return rij(gb, tot, 'min', 'altijd aftrekbaar', 'neg');
  }).join('');

  const hnviBankTot = belTX.filter(t=>isUitgave(t)&&t.gb==='7010').reduce((s,t)=>s+t.bedrag,0);
  const hnviVktTot2 = hnviJaar.filter(i=>i.status==='verkocht').reduce((s,i)=>s+i.inkoop,0);
  const hnviVrdTot2 = hnviJaar.filter(i=>i.status==='voorraad').reduce((s,i)=>s+i.inkoop,0);
  const heeftLoten = state.HNVI_LOTS.length > 0;
  const r7010Rows = heeftLoten
    ? rij('7010', hnviVktTot2, 'min', 'aftrekbaar — verkocht', 'neg') +
      (hnviVrdTot2 > 0 ? rij('7010', hnviVrdTot2, 'min', 'niet aftrekbaar — voorraad', '') : '')
    : rij('7010', hnviBankTot, 'min', 'voeg loten toe in HNVI-tab', '');

  document.getElementById("bel-kosten").innerHTML =
    subkop('Baten') + omzetRows +
    subkop('Rubriek 4 — altijd aftrekbaar') + r4Rows +
    subkop('Inkoop — altijd aftrekbaar') + r7AltijdRows +
    subkop('Inkoop HNVI (7010) — gekoppeld aan HNVI-tab') + r7010Rows;
}

// ---------------------------------------------------------------- aangifte

const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Het jaar dat nu in de jaarkiezer staat. */
const gekozenJaar = () => document.getElementById('f-jaar-bel')?.value || HUIDIG_JAAR;

/**
 * Dezelfde cijfers als de kaart, maar als platte tekst in de volgorde van het
 * aangifteformulier: winst uit onderneming, box 1. Bedragen zonder euroteken en
 * met een komma, zoals de invulvelden ze verwachten.
 */
export function aangifteTekst(jaar = gekozenJaar()) {
  const belTX = jaar === 'all'
    ? [...state.HIST_TX, ...state.TX]
    : (jaar === HUIDIG_JAAR ? state.TX : state.HIST_TX.filter(t => t.datum.startsWith(jaar)));

  const omzet = belTX.filter(t => isInkomst(t) && isOmzet(t.gb)).reduce((s, t) => s + t.bedrag, 0);
  const kostenOverig = belTX.filter(t => isUitgave(t) && t.gb !== '7010').reduce((s, t) => s + t.bedrag, 0);

  const hnviJaar = jaar === 'all' ? state.HNVI_LOTS : state.HNVI_LOTS.filter(i => i.datum && i.datum.startsWith(jaar));
  const hnviBank = belTX.filter(t => isUitgave(t) && t.gb === '7010').reduce((s, t) => s + (Number(t.bedrag) || 0), 0);
  const hnviInkoop = hnviJaar.length
    ? hnviJaar.filter(i => i.status === 'verkocht').reduce((s, i) => s + (Number(i.inkoop) || 0), 0)
    : hnviBank;

  const cogs = (state.COVERS || []).reduce((som, art) => {
    const prijs = Number(art.inkoopprijs ?? art.inkoop ?? 0);
    if (!(prijs > 0)) return som;
    if (jaar === 'all') {
      return som + prijs * Object.values(art.jaren || {}).reduce((n, j) => n + (Number(j?.verkocht) || 0), 0);
    }
    return som + prijs * (Number(art.jaren?.[jaar]?.verkocht) || 0);
  }, 0);

  const eind = (state.COVERS || []).reduce((som, art) => {
    const prijs = Number(art.inkoopprijs ?? art.inkoop ?? 0);
    if (!(prijs > 0)) return som;
    const aantal = jaar === 'all' || jaar === HUIDIG_JAAR
      ? Number(art.voorraad) || 0
      : Number(art.jaren?.[jaar]?.eind ?? 0);
    return som + prijs * aantal;
  }, 0);

  const handmatig = handmatigeKosten(jaar);
  const inkoopwaarde = cogs + hnviInkoop;
  const overigeKosten = kostenOverig + handmatig.reduce((s, k) => s + (Number(k.bedrag) || 0), 0);
  const winst = omzet - inkoopwaarde - overigeKosten;
  const mkb = winst > 0 ? winst * 0.142 : 0;
  const belastbaar = Math.max(0, winst - mkb);

  const bedrag = n => (Math.round(n * 100) / 100).toLocaleString('nl-NL', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  });
  const regel = (label, n) => `${label.padEnd(46, '.')} ${bedrag(n).padStart(12)}`;

  return [
    `AANGIFTE INKOMSTENBELASTING — WINST UIT ONDERNEMING`,
    `Boekjaar ${jaar === 'all' ? 'alle jaren' : jaar}`,
    ``,
    `OPBRENGSTEN`,
    regel('Netto-omzet', omzet),
    ``,
    `INKOOPWAARDE VAN DE OMZET`,
    regel('Inkoopwaarde verkochte voorraad', cogs),
    regel('Inkoopwaarde verkochte HNVI-loten', hnviInkoop),
    regel('Totaal inkoopwaarde', inkoopwaarde),
    ``,
    `OVERIGE BEDRIJFSKOSTEN`,
    regel('Kosten uit de administratie', kostenOverig),
    ...handmatig.map(k => regel(k.label || 'Overige post', Number(k.bedrag) || 0)),
    regel('Totaal overige kosten', overigeKosten),
    ``,
    `RESULTAAT`,
    regel('Winst uit onderneming', winst),
    regel('MKB-winstvrijstelling (14,2%)', mkb),
    regel('Belastbare winst', belastbaar),
    ``,
    `BALANS PER 31 DECEMBER`,
    regel('Voorraad (inkoopwaarde)', eind),
    ``,
    `Opgesteld met de Xtenate-administratie op ${new Date().toLocaleDateString('nl-NL')}.`,
    `Indicatie op basis van je eigen invoer; laat de aangifte controleren.`
  ].join('\n');
}

export function kopieerAangifte() {
  const tekst = aangifteTekst();
  navigator.clipboard?.writeText(tekst)
    .then(() => toonAangifte(tekst, 'Gekopieerd naar het klembord.'))
    .catch(() => toonAangifte(tekst, 'Kopiëren lukte niet — selecteer de tekst hieronder.'));
}

export function downloadAangifte() {
  const jaar = gekozenJaar();
  const blob = new Blob([aangifteTekst(jaar)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `aangifte-${jaar}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Klein venster met de tekst, zodat je meteen ziet wat er gekopieerd is. */
function toonAangifte(tekst, melding) {
  const laag = document.createElement('div');
  laag.className = 'pm-laag';
  laag.innerHTML = `
    <div class="pm-venster" role="dialog" aria-modal="true">
      <header class="pm-kop">
        <div>
          <h3>Aangiftegegevens ${gekozenJaar()}</h3>
          <p class="pm-sub">${escHtml(melding)}</p>
        </div>
        <button type="button" class="pm-kruis" data-sluit aria-label="Sluiten">&times;</button>
      </header>
      <div class="pm-inhoud">
        <pre style="margin:0;padding:16px 20px;font-size:12px;line-height:1.55;white-space:pre-wrap;font-variant-numeric:tabular-nums">${escHtml(tekst)}</pre>
      </div>
      <footer class="pm-voet">
        <span class="pm-hint">Esc sluit dit venster</span>
        <button type="button" class="btn" data-sluit>Sluiten</button>
      </footer>
    </div>`;
  koppelVenster(laag);
}

// ------------------------------------------------------ aftrekposten aanvullen

export function openExtraKosten() {
  const jaar = gekozenJaar();
  const posten = handmatigeKosten(jaar);
  const rijen = (posten.length ? posten : [{ label: '', bedrag: '' }]).map((k, i) => rijHtml(k, i)).join('');

  const laag = document.createElement('div');
  laag.className = 'pm-laag';
  laag.innerHTML = `
    <div class="pm-venster" role="dialog" aria-modal="true" style="max-width:520px">
      <header class="pm-kop">
        <div>
          <h3>Aftrekposten aanvullen — ${jaar}</h3>
          <p class="pm-sub">Kosten die niet uit je bankboekingen komen, zoals huur of verzekering. Maximaal vijf.</p>
        </div>
        <button type="button" class="pm-kruis" data-sluit aria-label="Sluiten">&times;</button>
      </header>
      <div class="pm-inhoud"><div id="xk-rijen" style="padding:16px 20px">${rijen}</div></div>
      <footer class="pm-voet">
        <button type="button" class="btn btn-sm" id="xk-erbij">Regel erbij</button>
        <div class="pm-knoppen">
          <button type="button" class="btn" data-sluit>Annuleren</button>
          <button type="button" class="btn btn-primary" id="xk-bewaar">Opslaan</button>
        </div>
      </footer>
    </div>`;

  const sluit = koppelVenster(laag);
  const rijenVak = laag.querySelector('#xk-rijen');

  laag.querySelector('#xk-erbij').addEventListener('click', () => {
    const n = rijenVak.querySelectorAll('.xk-rij').length;
    if (n >= 5) return;
    rijenVak.insertAdjacentHTML('beforeend', rijHtml({ label: '', bedrag: '' }, n));
  });

  laag.querySelector('#xk-bewaar').addEventListener('click', () => {
    const posten = [...rijenVak.querySelectorAll('.xk-rij')].map(rij => ({
      label: rij.querySelector('.xk-label').value.trim(),
      bedrag: Number(rij.querySelector('.xk-bedrag').value) || 0
    })).filter(k => k.label && k.bedrag > 0);
    localStorage.setItem(kostenSleutel(jaar), JSON.stringify(posten.slice(0, 5)));
    sluit();
    renderBelasting();
  });
}

function rijHtml(k, i) {
  return `
    <div class="xk-rij" style="display:grid;grid-template-columns:minmax(0,1fr) 120px 34px;gap:8px;margin-bottom:10px">
      <input class="xk-label" type="text" placeholder="Omschrijving" value="${escHtml(k.label || '')}"
             style="padding:8px 10px;font:inherit;font-size:13px;color:var(--text);background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm)">
      <input class="xk-bedrag" type="number" step="0.01" min="0" placeholder="0,00" value="${k.bedrag ?? ''}"
             style="padding:8px 10px;font:inherit;font-size:13px;text-align:right;color:var(--text);background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm)">
      <button type="button" onclick="this.closest('.xk-rij').remove()" aria-label="Regel verwijderen"
              style="border:1px solid var(--border);background:var(--surface);border-radius:var(--radius-sm);cursor:pointer;color:var(--text-muted)">&times;</button>
    </div>`;
}

/**
 * Hangt een venster in de pagina en regelt sluiten via Esc, de knoppen en een
 * klik ernaast. Esc gaat in de capture-fase, zodat de algemene Escape-handler
 * van de app er niet doorheen loopt.
 */
function koppelVenster(laag) {
  document.body.appendChild(laag);
  const sluit = () => { document.removeEventListener('keydown', opToets, true); laag.remove(); };
  function opToets(e) {
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); sluit(); }
  }
  document.addEventListener('keydown', opToets, true);
  laag.addEventListener('mousedown', e => { if (e.target === laag) sluit(); });
  laag.querySelectorAll('[data-sluit]').forEach(k => k.addEventListener('click', sluit));
  return sluit;
}
