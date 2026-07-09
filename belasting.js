// belasting.js — Belasting-pagina (indicatieve IB-berekening).

import { charts, dc } from './charts.js?v=20260710a';
import { GBNM, fmt, isInkomst, isOmzet, isUitgave } from './helpers.js?v=20260710a';
import { state } from './storage.js?v=20260710a';

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

  const kostenAftrekbaar = kostenOverig + hnviAftrekbaar;
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
    <div class="metric"><div class="lbl">HNVI voorraad (niet aftrekbaar)</div><div class="val" style="color:#888">${fmt(hnviNietAftrekbaar)}</div><div class="sub">${hnviVoorraadAantal} loten nog in voorraad</div></div>
    <div class="metric"><div class="lbl">Projectie heel jaar</div><div class="val ${winstJaar>=0?'pos':'neg'}">${fmt(winstJaar)}</div><div class="sub">op basis van ${maandenMet} mnd</div></div>`;

  const teruggaveRegel = ib < 0 ? `
    <div style="background:var(--green-bg);border:1px solid rgba(26,122,74,.2);border-radius:6px;padding:.625rem .875rem;margin-top:.75rem;font-size:12px;color:var(--green)">
      💡 Bij verlies kun je dit verrekenen met ander inkomen (bijv. loon). Geschatte teruggave: <strong>${fmt(Math.abs(Math.round(ib)))}</strong> — bespreek dit met je belastingadviseur.
    </div>` : '';

  const hnviWaarschuwing = hnviNietAftrekbaar > 0 ? `
    <div style="background:var(--amber-bg);border:1px solid rgba(122,79,0,.2);border-radius:6px;padding:.625rem .875rem;margin-top:.75rem;font-size:12px;color:var(--amber)">
      ⚠ ${fmt(hnviNietAftrekbaar)} HNVI inkoop is nog niet aftrekbaar (voorraad). Zodra je die loten verkoopt in de HNVI-tab wordt dit automatisch aangepast.
    </div>` : (state.HNVI_LOTS.length === 0 ? `
    <div style="background:var(--amber-bg);border:1px solid rgba(122,79,0,.2);border-radius:6px;padding:.625rem .875rem;margin-top:.75rem;font-size:12px;color:var(--amber)">
      ⚠ Voeg je HNVI-loten toe in de HNVI-tab zodat de belasting correct wordt berekend. Nu wordt alle 7010 inkoop als aftrekbaar beschouwd.
    </div>` : '');

  document.getElementById('bel-calc').innerHTML = `
    <div class="ib-row"><span>Bruto omzet</span><span>${fmt(omzet)}</span></div>
    <div class="ib-row"><span>Overige kosten & inkoop</span><span class="neg">– ${fmt(kostenOverig)}</span></div>
    <div class="ib-row"><span>HNVI inkoop (verkochte loten)</span><span class="neg">– ${fmt(hnviAftrekbaar)}</span></div>
    <div class="ib-row" style="color:#888;font-size:11px"><span>HNVI inkoop (voorraad, niet aftrekbaar)</span><span>${fmt(hnviNietAftrekbaar)}</span></div>
    <div class="ib-row"><span style="font-weight:600">Winst / verlies</span><span style="font-weight:600" class="${winst>=0?'pos':'neg'}">${fmt(winst)}</span></div>
    ${winst > 0 ? `
    <div class="ib-row"><span>MKB-winstvrijstelling (14,2%)</span><span class="neg">– ${fmt(mkb)}</span></div>
    <div class="ib-row"><span>Belastbaar inkomen</span><span>${fmt(Math.round(belastbaar))}</span></div>
    <div class="ib-row"><span>Tarief schijf 1 (36,97%)</span><span></span></div>
    <div class="ib-total"><span>Geschatte inkomstenbelasting</span><span class="neg">${fmt(Math.round(ib))}</span></div>` : `
    <div class="ib-total"><span>${ib < 0 ? 'Geschatte teruggave (bij ander inkomen)' : 'Geen belasting verschuldigd'}</span><span class="${ib<0?'pos':''}">${ib<0?'+ '+fmt(Math.abs(Math.round(ib))):'€\u202f0,00'}</span></div>`}

    <div style="margin-top:1rem;padding-top:.75rem;border-top:1px solid var(--border);font-size:11px;color:var(--text-muted)">
      <strong>Projectie heel jaar</strong> (op basis van ${maandenMet} maanden): omzet ${fmt(omzetJaar)} · kosten ${fmt(kostenJaar)} · winst ${fmt(winstJaar)} · geschatte IB ${ibJaar<0?'teruggave '+fmt(Math.abs(Math.round(ibJaar))):fmt(Math.round(ibJaar))}
    </div>`;

  const omzData = [
    belTX.filter(t=>isInkomst(t)&&t.gb==='8000').reduce((s,t)=>s+t.bedrag,0),
    belTX.filter(t=>isInkomst(t)&&t.gb==='8010').reduce((s,t)=>s+t.bedrag,0),
    belTX.filter(t=>isInkomst(t)&&t.gb==='8020').reduce((s,t)=>s+t.bedrag,0),
  ];
  const omzLabels = ['Xtenate (8000)','Bol.com covers (8010)','Helmetstore (8020)'];
  const colors = ['#7C4DFF','#FF6B9D','#FFB347'];
  dc('c-bel');
  charts['c-bel'] = new Chart(document.getElementById('c-bel'), {type:'doughnut',data:{labels:omzLabels,datasets:[{data:omzData,backgroundColor:colors,borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,cutout:'62%',plugins:{legend:{display:false}}}});
  document.getElementById('bel-legend').innerHTML = omzLabels.map((n,i)=>`<span style="display:flex;align-items:center;gap:5px"><span style="width:9px;height:9px;border-radius:2px;background:${colors[i]}"></span>${n} ${fmt(omzData[i])}</span>`).join('');

  const subkop = (tekst) => `<tr><td colspan="4" style="padding:10px 0 4px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted)">${tekst}</td></tr>`;
  const rij = (gb, bedrag, richting, label, kleur) => {
    const bg = kleur==='pos'?'var(--green-bg)':kleur==='neg'?'var(--red-bg)':'#f0f0f0';
    const fc = kleur==='pos'?'var(--green)':kleur==='neg'?'var(--red)':'#888';
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
