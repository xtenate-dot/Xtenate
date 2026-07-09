// dashboard.js — Home-pagina (renderHome, jaarwissel).

import { charts, dc } from './charts.js';
import { GBNM, ddmm, fmt, isInkomst, isOmzet, isUitgave, rekBadge, typeBadge, weergaveNaam } from './helpers.js';
import { HOME_TOTALS, state } from './storage.js';

export function wisselJaar() {
  state.huidigJaar = document.getElementById('jaar-selector').value;
  renderHome();
}

export function getHomeTX() {
  if (state.huidigJaar === 'all') return [...state.HIST_TX, ...state.TX];
  if (state.huidigJaar === '2026') return state.TX;
  return state.HIST_TX.filter(t => t.datum.startsWith(state.huidigJaar));
}

// Berekent de 8 hoofd-metrics (omzet/kosten/privé/HNVI) voor één jaar. Gebruikt de
// jaartotalen uit een Excel-import ("Per Periode"-tabblad) als die er zijn — die komen
// rechtstreeks uit de boekhouding en zijn dus leidend. Alleen als die ontbreken, wordt
// er (zoals voorheen) opgeteld uit de losse boekingen van dat jaar.
function berekenJaarMetrics(jaar, txVanJaar) {
  const override = HOME_TOTALS[jaar];
  if (override) return { ...override, uitExcel: true };
  return {
    omzet: txVanJaar.filter(t => isInkomst(t) && isOmzet(t.gb)).reduce((s,t) => s+t.bedrag, 0),
    kosten: txVanJaar.filter(isUitgave).reduce((s,t) => s+t.bedrag, 0),
    omzXt: txVanJaar.filter(t => isInkomst(t) && t.gb==='8000').reduce((s,t) => s+t.bedrag, 0),
    omzBol: txVanJaar.filter(t => isInkomst(t) && t.gb==='8010').reduce((s,t) => s+t.bedrag, 0),
    omzHC: txVanJaar.filter(t => isInkomst(t) && t.gb==='8020').reduce((s,t) => s+t.bedrag, 0),
    priveOp: txVanJaar.filter(t => t.type==='prive_opname').reduce((s,t) => s+t.bedrag, 0),
    priveSt: txVanJaar.filter(t => t.type==='prive_storting').reduce((s,t) => s+t.bedrag, 0),
    hnviInv: txVanJaar.filter(t => t.gb==='7010').reduce((s,t) => s+t.bedrag, 0),
    uitExcel: false
  };
}

export function renderHome() {
  const homeTX = getHomeTX();

  let metrics;
  if (state.huidigJaar === 'all') {
    const alleTx = [...state.HIST_TX, ...state.TX];
    const jaren = [...new Set(alleTx.map(t => t.datum.slice(0,4)))];
    metrics = jaren.reduce((acc, j) => {
      const m = berekenJaarMetrics(j, alleTx.filter(t => t.datum.startsWith(j)));
      ['omzet','kosten','omzXt','omzBol','omzHC','priveOp','priveSt','hnviInv'].forEach(k => acc[k] = (acc[k]||0) + m[k]);
      acc.uitExcel = acc.uitExcel && m.uitExcel;
      return acc;
    }, {uitExcel: jaren.length > 0});
  } else {
    metrics = berekenJaarMetrics(state.huidigJaar, homeTX);
  }
  const { omzet, kosten, omzXt, omzBol, omzHC, priveOp, priveSt, hnviInv, uitExcel } = metrics;
  const vrdCovers = state.COVERS.reduce((s,c) => s+c.voorraad, 0);
  const bronLabel = uitExcel ? ' <span style="font-size:10px;color:var(--green,#4ADE80)" title="Uit Per Periode-totalen van Excel-import">✓ Excel-totalen</span>' : '';

  document.getElementById('home-metrics').innerHTML = `
    <div class="metric"><div class="lbl">Omzet ${state.huidigJaar==='all'?'alle jaren':state.huidigJaar}${bronLabel}</div><div class="val pos">${fmt(omzet)}</div></div>
    <div class="metric"><div class="lbl">Kosten ${state.huidigJaar==='all'?'alle jaren':state.huidigJaar}</div><div class="val neg">${fmt(kosten)}</div></div>
    <div class="metric"><div class="lbl">Netto resultaat</div><div class="val ${omzet-kosten>=0?'pos':'neg'}">${fmt(omzet-kosten)}</div></div>
    <div class="metric"><div class="lbl">Xtenate omzet</div><div class="val">${fmt(omzXt)}</div></div>
    <div class="metric"><div class="lbl">Bol.com omzet</div><div class="val">${fmt(omzBol)}</div></div>
    <div class="metric"><div class="lbl">Helmetstore omzet</div><div class="val">${fmt(omzHC)}</div></div>
    <div class="metric"><div class="lbl">Covers voorraad</div><div class="val">${vrdCovers} stuks</div></div>
    <div class="metric"><div class="lbl">HNVI inkoop</div><div class="val neg">${fmt(hnviInv)}</div></div>
    <div class="metric"><div class="lbl">Privé opnames</div><div class="val" style="color:#888">${fmt(priveOp)}</div></div>
    <div class="metric"><div class="lbl">Privé stortingen</div><div class="val" style="color:#888">${fmt(priveSt)}</div></div>`;

  const topInc = [...homeTX].filter(t => isInkomst(t)).sort((a,b) => b.bedrag-a.bedrag).slice(0,2);
  const topExp = [...homeTX].filter(isUitgave).sort((a,b) => b.bedrag-a.bedrag).slice(0,2);
  document.getElementById('home-uitsch').innerHTML = [...topInc,...topExp].map(t => `
    <div class="uitsch-item">
      <div class="uitsch-icon" style="background:${isInkomst(t)?'var(--green-bg)':'var(--red-bg)'}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${isInkomst(t)?'var(--green)':'var(--red)'}" stroke-width="2.5">
          ${isInkomst(t)?'<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>':'<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>'}
        </svg>
      </div>
      <div class="uitsch-info"><div class="uitsch-naam">${weergaveNaam(t)}</div><div class="uitsch-meta">${ddmm(t.datum)} · ${GBNM[t.gb]||t.gb}</div></div>
      <div class="uitsch-bedrag ${isInkomst(t)?'pos':'neg'}">${isInkomst(t)?'+':'–'}${fmt(t.bedrag)}</div>
    </div>`).join('');

  const alleM = [...new Set(homeTX.map(t=>t.datum.slice(0,7)))].sort();
  const maanden = alleM;
  const mnmsFull = {'2022-01':'jan 22','2022-02':'feb 22','2022-03':'mrt 22','2022-04':'apr 22','2022-05':'mei 22','2022-06':'jun 22','2022-07':'jul 22','2022-08':'aug 22','2022-09':'sep 22','2022-10':'okt 22','2022-11':'nov 22','2022-12':'dec 22','2023-01':'jan 23','2023-02':'feb 23','2023-03':'mrt 23','2023-04':'apr 23','2023-05':'mei 23','2023-06':'jun 23','2023-07':'jul 23','2023-08':'aug 23','2023-09':'sep 23','2023-10':'okt 23','2023-11':'nov 23','2023-12':'dec 23','2024-01':'jan 24','2024-02':'feb 24','2024-03':'mrt 24','2024-04':'apr 24','2024-05':'mei 24','2024-06':'jun 24','2024-07':'jul 24','2024-08':'aug 24','2024-09':'sep 24','2024-10':'okt 24','2024-11':'nov 24','2024-12':'dec 24','2025-01':'jan 25','2025-02':'feb 25','2025-03':'mrt 25','2025-04':'apr 25','2025-05':'mei 25','2025-06':'jun 25','2025-07':'jul 25','2025-08':'aug 25','2025-09':'sep 25','2025-10':'okt 25','2025-11':'nov 25','2025-12':'dec 25','2026-01':'jan 26','2026-02':'feb 26','2026-03':'mrt 26','2026-04':'apr 26','2026-05':'mei 26','2026-06':'jun 26'};
  const labels = maanden.map(m => mnmsFull[m] || m);
  const incD = maanden.map(m => homeTX.filter(t => isInkomst(t) && isOmzet(t.gb) && t.datum.startsWith(m)).reduce((s,t)=>s+t.bedrag,0));
  const expD = maanden.map(m => homeTX.filter(t => isUitgave(t) && t.datum.startsWith(m)).reduce((s,t)=>s+t.bedrag,0));
  const netD = maanden.map((_,i) => incD[i]-expD[i]);

  dc('c-ie');
  charts['c-ie'] = new Chart(document.getElementById('c-ie'), {type:'bar',data:{labels,datasets:[{label:'Omzet',data:incD,backgroundColor:'#7C4DFF'},{label:'Kosten',data:expD,backgroundColor:'#FF6B9D'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{font:{size:11},boxWidth:10}}},scales:{x:{ticks:{font:{size:11}}},y:{ticks:{font:{size:11},callback:v=>'€'+v}}}}});
  dc('c-net');
  charts['c-net'] = new Chart(document.getElementById('c-net'), {type:'line',data:{labels,datasets:[{label:'Netto',data:netD,borderColor:'#FFB347',backgroundColor:'rgba(255,179,71,0.1)',tension:.35,fill:true,pointRadius:4,pointBackgroundColor:'#FFB347'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{font:{size:11},boxWidth:10}}},scales:{x:{ticks:{font:{size:11}}},y:{ticks:{font:{size:11},callback:v=>'€'+v}}}}});

  const recent = [...homeTX].sort((a,b) => b.datum.localeCompare(a.datum)).slice(0,8);
  document.getElementById('home-recent').innerHTML = recent.map(t => `<tr>
    <td style="color:var(--text-muted)">${ddmm(t.datum)}</td>
    <td class="td-trunc">${weergaveNaam(t)}</td>
    <td>${rekBadge(t.rek)}</td>
    <td style="text-align:right">${typeBadge(t.type, t.bedrag)}</td>
  </tr>`).join('');
}
