// belasting.js — Belasting-pagina (indicatieve IB-berekening met voorraad COGS).

import { charts, dc , palette } from './charts.js?v=20260812c';
import { GBNM, fmt, isInkomst, isOmzet, isUitgave } from './helpers.js?v=20260812c';
import { state } from './storage.js?v=20260812c';

export function renderBelasting() {
  const jaar = document.getElementById('f-jaar-bel') ? document.getElementById('f-jaar-bel').value : '2026';
  const belTX = jaar === 'all' ? [...state.HIST_TX, ...state.TX] : (jaar === '2026' ? state.TX : state.HIST_TX.filter(t => t.datum.startsWith(jaar)));

  const ct = document.getElementById('bel-card-title');
  if (ct) ct.textContent = `Berekening box 1 — indicatie ${jaar === 'all' ? 'alle jaren' : jaar}`;

  const omzet = belTX.filter(t => isInkomst(t) && isOmzet(t.gb)).reduce((s,t)=>s+t.bedrag,0);
  const kostenOverig = belTX.filter(t => isUitgave(t) && t.gb !== '7010').reduce((s,t)=>s+t.bedrag,0);

  // ===== VOORRAAD: COGS (Cost of Goods Sold) =====
  // Alleen kosten tellen WANNEER artikelen VERKOCHT zijn, niet wanneer ingekocht.
  // Per artikel: inkoopprijs × aantal_verkocht_dit_jaar
  const voorraadCogs = (state.COVERS || []).reduce((totaal, artikel) => {
    const inkoopprijs = Number(artikel.inkoopprijs || artikel.inkoop || 0);
    if (inkoopprijs <= 0) return totaal;
    
    const jaarGegevens = artikel.jaren?.[jaar];
    if (!jaarGegevens) return totaal;
    
    const aantVerkocht = Number(jaarGegevens.verkocht || 0);
    return totaal + (inkoopprijs * aantVerkocht);
  }, 0);
  
  // Voorraad einde jaar (voor balansstaat)
  const voorraadEindeJaar = (state.COVERS || []).reduce((totaal, artikel) => {
    const inkoopprijs = Number(artikel.inkoopprijs || artikel.inkoop || 0);
    const jaarGegevens = artikel.jaren?.[jaar];
    const aantEinde = Number(jaarGegevens?.eind ?? artikel.voorraad ?? 0);
    return totaal + (inkoopprijs * aantEinde);
  }, 0);

  // HNVI: alleen verkochte loten tellen
  const hnviJaar = jaar === 'all' ? state.HNVI_LOTS : state.HNVI_LOTS.filter(i => i.datum && i.datum.startsWith(jaar));
  const hnviVerkocht = hnviJaar.filter(i => i.status === 'verkocht').reduce((s,i)=>s+(Number(i.inkoop)||0),0);
  const hnviVoorraad = hnviJaar.filter(i => i.status === 'voorraad').reduce((s,i)=>s+(Number(i.inkoop)||0),0);
  const hnviVoorraadAantal = hnviJaar.filter(i => i.status === 'voorraad').length;
  const hnviTotaalBank = belTX.filter(t => isUitgave(t) && t.gb === '7010').reduce((s,t)=>s+(Number(t.bedrag)||0),0);
  const hnviAftrekbaar = hnviJaar.length > 0 ? hnviVerkocht : hnviTotaalBank;
  const hnviNietAftrekbaar = hnviVoorraad;

  const kostenAftrekbaar = kostenOverig + hnviAftrekbaar + voorraadCogs;
  const winst = omzet - kostenAftrekbaar;

  // Projectie
  const maandenMet = [...new Set(belTX.filter(t=>isInkomst(t)&&isOmzet(t.gb)).map(t=>t.datum.slice(0,7)))].length || 1;
  const omzetPerMaand = omzet / maandenMet;
  const kostenPerMaand = kostenAftrekbaar / maandenMet;
  const omzetJaar = Math.round(omzetPerMaand * 12);
  const kostenJaar = Math.round(kostenPerMaand * 12);
  const winstJaar = omzetJaar - kostenJaar;

  // IB berekening (2024 tarieven)
  const calcIB = (w) => {
    if (w <= 0) return w * 0.3697;
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
    <div class="metric"><div class="lbl">Voorraad einde jaar</div><div class="val" style="color:var(--text-muted)">${fmt(voorraadEindeJaar)}</div></div>
    <div class="metric"><div class="lbl">Projectie heel jaar</div><div class="val ${winstJaar>=0?'pos':'neg'}">${fmt(winstJaar)}</div><div class="sub">op basis van ${maandenMet} mnd</div></div>`;

  const teruggaveRegel = ib < 0 ? `<div style="background:var(--green-bg);border:1px solid color-mix(in srgb, var(--green) 25%, transparent);border-radius:6px;padding:.625rem .875rem;margin-top:.75rem;font-size:12px;color:var(--green)">💡 Bij verlies kun je dit verrekenen met ander inkomen. Geschatte teruggave: <strong>${fmt(Math.abs(Math.round(ib)))}</strong></div>` : '';

  const voorraadWaarschuwing = voorraadEindeJaar > 0 ? `<div style="background:var(--blue-bg);border:1px solid color-mix(in srgb, var(--blue) 25%, transparent);border-radius:6px;padding:.625rem .875rem;margin-top:.75rem;font-size:12px;color:var(--blue)">ℹ️ Eindvoorraad ${fmt(voorraadEindeJaar)} staat op je balansstaat als actief.</div>` : '';

  const hnviWaarschuwing = hnviNietAftrekbaar > 0 ? `<div style="background:var(--amber-bg);border:1px solid color-mix(in srgb, var(--amber) 25%, transparent);border-radius:6px;padding:.625rem .875rem;margin-top:.75rem;font-size:12px;color:var(--amber)">⚠ ${fmt(hnviNietAftrekbaar)} HNVI voorraad (nog niet aftrekbaar)</div>` : (state.HNVI_LOTS.length === 0 ? `<div style="background:var(--amber-bg);border:1px solid color-mix(in srgb, var(--amber) 25%, transparent);border-radius:6px;padding:.625rem .875rem;margin-top:.75rem;font-size:12px;color:var(--amber)">⚠ Voeg HNVI-loten toe voor correcte berekening</div>` : '');

  document.getElementById('bel-calc').innerHTML = `
    <div class="ib-row"><span>Bruto omzet</span><span>${fmt(omzet)}</span></div>
    <div class="ib-row"><span>Overige kosten</span><span class="neg">– ${fmt(kostenOverig)}</span></div>
    <div class="ib-row"><span>HNVI inkoop (verkochte loten)</span><span class="neg">– ${fmt(hnviAftrekbaar)}</span></div>
    <div class="ib-row"><span>Voorraad COGS (verkochte artikelen)</span><span class="neg">– ${fmt(voorraadCogs)}</span></div>
    <div class="ib-row" style="color:var(--text-muted);font-size:11px"><span>HNVI voorraad (niet aftrekbaar)</span><span>${fmt(hnviNietAftrekbaar)}</span></div>
    <div class="ib-row" style="color:var(--text-muted);font-size:11px"><span>Eindvoorraad artikelen</span><span>${fmt(voorraadEindeJaar)}</span></div>
    <div class="ib-row"><span style="font-weight:600">Winst / verlies</span><span style="font-weight:600" class="${winst>=0?'pos':'neg'}">${fmt(winst)}</span></div>
    ${ib > 38441 * 0.3697 ? `<div class="ib-row" style="color:var(--amber);font-size:11px"><span>MKB (19% korting)</span><span>– ${fmt(mkb)}</span></div><div class="ib-row" style="color:var(--amber);font-size:11px"><span>Belastbaar inkomen</span><span>${fmt(belastbaar)}</span></div>` : ''}`;

  document.getElementById('bel-info').innerHTML = teruggaveRegel + voorraadWaarschuwing + hnviWaarschuwing;
  
  // Update aangifte tab als deze zichtbaar is
  const aContainer = document.getElementById('aangifte-container');
  if (aContainer && aContainer.style.display !== 'none') {
    aContainer.innerHTML = openAangifteTab(jaar);
  }
}

// ===== AANGIFTE IB TAB =====

export function openAangifteTab(jaar) {
  const belTX = jaar === 'all' ? [...state.HIST_TX, ...state.TX] : (jaar === '2026' ? state.TX : state.HIST_TX.filter(t => t.datum.startsWith(jaar)));
  const omzet = belTX.filter(t => isInkomst(t) && isOmzet(t.gb)).reduce((s,t)=>s+t.bedrag,0);
  const kostenOverig = belTX.filter(t => isUitgave(t) && t.gb !== '7010').reduce((s,t)=>s+t.bedrag,0);

  // Voorraad COGS
  const voorraadCogs = (state.COVERS || []).reduce((totaal, artikel) => {
    const inkoopprijs = Number(artikel.inkoopprijs || artikel.inkoop || 0);
    if (inkoopprijs <= 0) return totaal;
    const jaarGegevens = artikel.jaren?.[jaar];
    if (!jaarGegevens) return totaal;
    const aantVerkocht = Number(jaarGegevens.verkocht || 0);
    return totaal + (inkoopprijs * aantVerkocht);
  }, 0);

  // HNVI
  const hnviJaar = jaar === 'all' ? state.HNVI_LOTS : state.HNVI_LOTS.filter(i => i.datum && i.datum.startsWith(jaar));
  const hnviVerkocht = hnviJaar.filter(i => i.status === 'verkocht').reduce((s,i)=>s+(Number(i.inkoop)||0),0);

  // Handmatige kosten uit localStorage
  const extraKostenKey = `xtenate_aangifte_extra_${jaar}`;
  const extraKosten = JSON.parse(localStorage.getItem(extraKostenKey) || '[]');

  const totInkomsten = omzet;
  const totAftrek = kostenOverig + voorraadCogs + hnviVerkocht + extraKosten.reduce((s,k)=>s+Number(k.bedrag||0),0);
  const winst = totInkomsten - totAftrek;

  const calcIB = (w) => {
    if (w <= 0) return w * 0.3697;
    const mkb = w * 0.142;
    const belastbaar = Math.max(0, w - mkb);
    return belastbaar <= 38441 ? belastbaar * 0.3697 : 38441 * 0.3697 + (belastbaar-38441) * 0.495;
  };
  const ib = calcIB(winst);
  const mkb = winst > 0 ? Math.round(winst * 0.142) : 0;
  const belastbaar = winst > 0 ? Math.max(0, winst - mkb) : 0;

  const extraRijen = extraKosten.map((k, i) => `
    <div style="display: grid; grid-template-columns: 1fr 120px 40px; gap: 8px; margin-bottom: 8px; align-items: end;">
      <input type="text" placeholder="bijv. Huurkosten, Verzekering" value="${k.label || ''}" id="aangifte-extra-label-${i}" style="padding: 6px; font-size: 12px; border: 1px solid var(--border); border-radius: 3px;">
      <input type="number" placeholder="€ bedrag" value="${k.bedrag || 0}" id="aangifte-extra-bedrag-${i}" step="0.01" style="padding: 6px; font-size: 12px; border: 1px solid var(--border); border-radius: 3px;">
      <button type="button" onclick="verwijderAangifteExtraRij(${i}, '${jaar}')" style="padding: 6px 8px; background: var(--red); color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 12px;">✕</button>
    </div>`).join('');

  const addExtraRijBtn = extraKosten.length < 5 ? `<button type="button" onclick="voegAangifteExtraRijToe('${jaar}')" style="padding: 8px 12px; background: var(--blue); color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 12px;">+ Kostenregel toevoegen</button>` : '';

  const html = `
    <div style="max-width: 600px; font-family: monospace; line-height: 1.6; font-size: 13px;">
      <div style="background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 16px;">
        
        <div style="font-weight: bold; margin-bottom: 12px;">INKOMSTENBELASTING BOX 1 — ${jaar}</div>
        
        <div style="margin-bottom: 16px;">
          <div style="border-bottom: 2px solid var(--border); padding-bottom: 8px; margin-bottom: 8px; font-weight: bold;">INKOMSTEN</div>
          <div style="display: grid; grid-template-columns: 1fr auto; gap: 12px; margin-bottom: 6px;">
            <span>Bedrijfsopbrengsten (omzet)</span>
            <span style="text-align: right;">${fmt(omzet)}</span>
          </div>
          <div style="display: grid; grid-template-columns: 1fr auto; gap: 12px; border-top: 1px solid var(--border); padding-top: 6px; margin-bottom: 12px; font-weight: bold;">
            <span>TOTAAL INKOMSTEN</span>
            <span style="text-align: right;">${fmt(totInkomsten)}</span>
          </div>
        </div>

        <div style="margin-bottom: 16px;">
          <div style="border-bottom: 2px solid var(--border); padding-bottom: 8px; margin-bottom: 8px; font-weight: bold;">AFTREKPOSTEN</div>
          <div style="display: grid; grid-template-columns: 1fr auto; gap: 12px; font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">
            <span>A. Kostprijs goederen (voorraad COGS)</span>
            <span style="text-align: right;">${fmt(voorraadCogs)}</span>
          </div>
          <div style="display: grid; grid-template-columns: 1fr auto; gap: 12px; font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">
            <span>B. HNVI inkoop (verkochte loten)</span>
            <span style="text-align: right;">${fmt(hnviVerkocht)}</span>
          </div>
          <div style="display: grid; grid-template-columns: 1fr auto; gap: 12px; font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">
            <span>J. Overige bedrijfsuitgaven</span>
            <span style="text-align: right;">${fmt(kostenOverig)}</span>
          </div>
          
          <div style="border-top: 1px solid var(--border); padding-top: 8px; margin-bottom: 12px;">
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 8px; font-weight: bold;">Overige aftrekposten (handmatig in te vullen):</div>
            ${extraRijen}
            ${addExtraRijBtn}
          </div>

          <div style="display: grid; grid-template-columns: 1fr auto; gap: 12px; border-top: 1px solid var(--border); padding-top: 6px; margin-bottom: 12px; font-weight: bold;">
            <span>TOTAAL AFTREKPOSTEN</span>
            <span style="text-align: right;">${fmt(totAftrek)}</span>
          </div>
        </div>

        <div style="margin-bottom: 16px;">
          <div style="display: grid; grid-template-columns: 1fr auto; gap: 12px; border-bottom: 2px solid var(--border); padding-bottom: 6px; margin-bottom: 12px; font-weight: bold;">
            <span>WINST / VERLIES</span>
            <span style="text-align: right; color: ${winst >= 0 ? 'var(--green)' : 'var(--red)'};">${fmt(winst)}</span>
          </div>
        </div>

        <div style="margin-bottom: 16px; background: var(--surface-hover); padding: 12px; border-radius: 4px;">
          <div style="border-bottom: 1px solid var(--border); padding-bottom: 8px; margin-bottom: 8px; font-weight: bold;">BELASTINGBEREKENING</div>
          <div style="display: grid; grid-template-columns: 1fr auto; gap: 12px; font-size: 12px; margin-bottom: 4px;">
            <span>Ondernemingswinst</span>
            <span style="text-align: right;">${fmt(winst)}</span>
          </div>
          ${winst > 0 ? `
          <div style="display: grid; grid-template-columns: 1fr auto; gap: 12px; font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">
            <span>MKB-korting (14,2%)</span>
            <span style="text-align: right;">– ${fmt(mkb)}</span>
          </div>
          <div style="display: grid; grid-template-columns: 1fr auto; gap: 12px; font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">
            <span>Belastbaar inkomen</span>
            <span style="text-align: right;">${fmt(belastbaar)}</span>
          </div>
          ` : ''}
          <div style="display: grid; grid-template-columns: 1fr auto; gap: 12px; border-top: 1px solid var(--border); padding-top: 6px; font-weight: bold; color: ${ib <= 0 ? 'var(--green)' : 'var(--red)'};">
            <span>${ib <= 0 ? 'Geschatte teruggave' : 'Geschatte IB box 1'}</span>
            <span style="text-align: right;">${ib <= 0 ? '+' : ''}${fmt(Math.abs(Math.round(ib)))}</span>
          </div>
        </div>

        <div style="text-align: right; gap: 8px; display: flex; justify-content: flex-end;">
          <button onclick="kopieerAangifte('${jaar}')" style="padding: 8px 16px; background: var(--blue); color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 12px; font-weight: bold;">📋 Kopieëren naar klembord</button>
        </div>
      </div>
    </div>`;

  return html;
}

function voegAangifteExtraRijToe(jaar) {
  const key = `xtenate_aangifte_extra_${jaar}`;
  const extra = JSON.parse(localStorage.getItem(key) || '[]');
  if (extra.length < 5) {
    extra.push({ label: '', bedrag: 0 });
    localStorage.setItem(key, JSON.stringify(extra));
    toonAangifteTab(jaar);
  }
}

function verwijderAangifteExtraRij(i, jaar) {
  const key = `xtenate_aangifte_extra_${jaar}`;
  const extra = JSON.parse(localStorage.getItem(key) || '[]');
  extra.splice(i, 1);
  localStorage.setItem(key, JSON.stringify(extra));
  toonAangifteTab(jaar);
}

function slaaAangifteOp(jaar) {
  const inputs = document.querySelectorAll('[id^="aangifte-extra-"]');
  const extra = [];
  for (let i = 0; i < inputs.length; i += 2) {
    const label = inputs[i]?.value || '';
    const bedrag = parseFloat(inputs[i+1]?.value || 0);
    if (label || bedrag) extra.push({ label, bedrag });
  }
  localStorage.setItem(`xtenate_aangifte_extra_${jaar}`, JSON.stringify(extra.slice(0, 5)));
  toonAangifteTab(jaar);
}

function kopieerAangifte(jaar) {
  slaaAangifteOp(jaar);
  const htm = openAangifteTab(jaar);
  const txt = htm.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&euro;/g, '€');
  navigator.clipboard.writeText(txt).then(() => {
    alert('Aangiftegegevens gekopieerd!');
  }).catch(err => {
    console.error('Kopieëren mislukt:', err);
  });
}

function toonAangifteTab(jaar) {
  const container = document.getElementById('aangifte-container');
  if (container) container.innerHTML = openAangifteTab(jaar);
}

// Window exports
if (typeof window !== 'undefined') {
  window.openAangifteTab = openAangifteTab;
  window.voegAangifteExtraRijToe = voegAangifteExtraRijToe;
  window.verwijderAangifteExtraRij = verwijderAangifteExtraRij;
  window.slaaAangifteOp = slaaAangifteOp;
  window.kopieerAangifte = kopieerAangifte;
  window.toonAangifteTab = toonAangifteTab;
}
