// dashboard.js — Home: het financiële dashboard.

import { baseOpts, charts, cssVar, dc, palette } from './charts.js?v=20260821m';
import {
  BEGINSALDO_2026, GBNM, calcIB, ddmm, esc, fmt, fmtKort, isInkomst, isOmzet, isUitgave,
  maandLabel, rekBadge, saldoDelta, typeBadge, weergaveNaam
} from './helpers.js?v=20260821m';
import { HOME_TOTALS, MAAND_SALDOS, state } from './storage.js?v=20260821m';
import { maakSorteerbaar } from './tables.js?v=20260821m';

const HOOFDREKENING = '1010'; // de bankrekening waarop het beginsaldo staat

export function wisselJaar() {
  state.huidigJaar = document.getElementById('jaar-selector').value;
  renderHome();
}

export function getHomeTX() {
  if (state.huidigJaar === 'all') return [...state.HIST_TX, ...state.TX];
  if (state.huidigJaar === '2026') return state.TX;
  return state.HIST_TX.filter(t => t.datum.startsWith(state.huidigJaar));
}

// Berekent de hoofdcijfers voor één jaar. Jaartotalen uit een Excel-import
// ("Per Periode") komen rechtstreeks uit de boekhouding en zijn leidend;
// alleen als die ontbreken wordt er opgeteld uit de losse boekingen.
function berekenJaarMetrics(jaar, txVanJaar) {
  // Fase 3B: Excel-overrides UITGESCHAKELD — altijd live van Supabase rekenen
  // const override = HOME_TOTALS[jaar];
  // if (override) return { ...override, uitExcel: true };
  
  return {
    omzet: txVanJaar.filter(t => isInkomst(t) && isOmzet(t.gb)).reduce((s, t) => s + t.bedrag, 0),
    kosten: txVanJaar.filter(isUitgave).reduce((s, t) => s + t.bedrag, 0),
    omzXt: txVanJaar.filter(t => isInkomst(t) && t.gb === '8000').reduce((s, t) => s + t.bedrag, 0),
    omzBol: txVanJaar.filter(t => isInkomst(t) && t.gb === '8010').reduce((s, t) => s + t.bedrag, 0),
    omzHC: txVanJaar.filter(t => isInkomst(t) && t.gb === '8020').reduce((s, t) => s + t.bedrag, 0),
    priveOp: txVanJaar.filter(t => t.type === 'prive_opname').reduce((s, t) => s + t.bedrag, 0),
    priveSt: txVanJaar.filter(t => t.type === 'prive_storting').reduce((s, t) => s + t.bedrag, 0),
    hnviInv: txVanJaar.filter(t => t.gb === '7010').reduce((s, t) => s + t.bedrag, 0),
    uitExcel: false
  };
}

/**
 * Banksaldo van de hoofdrekening. Voor 2026 loopt het door vanaf het beginsaldo;
 * voor afgesloten jaren wordt het eindsaldo van de laatste maand gebruikt.
 */
function berekenBanksaldo(jaar) {
  const huidig = () => BEGINSALDO_2026 + state.TX
    .filter(t => t.rek === HOOFDREKENING)
    .reduce((s, t) => s + saldoDelta(t), 0);

  if (jaar === '2026' || jaar === 'all') return { saldo: huidig(), label: 'Bank · nu' };

  const maandenVanJaar = Object.keys(MAAND_SALDOS).filter(m => m.startsWith(jaar)).sort();
  const laatste = maandenVanJaar[maandenVanJaar.length - 1];
  if (laatste) return { saldo: MAAND_SALDOS[laatste].eind, label: `Bank · eind ${maandLabel(laatste)}` };
  return { saldo: null, label: 'geen saldo bekend' };
}

/** Waarde van de voorraad: HNVI-loten tegen inkoopprijs, plus het aantal covers. */
function berekenVoorraad() {
  const inVoorraad = state.HNVI_LOTS.filter(l => l.status === 'voorraad');
  return {
    waarde: inVoorraad.reduce((s, l) => s + (Number(l.inkoop) || 0), 0),
    loten: inVoorraad.length,
    covers: state.COVERS.reduce((s, c) => s + c.voorraad, 0)
  };
}

function kpi(label, waarde, klasse = '', sub = '', extra = '') {
  return `<div class="kpi${extra}">
    <div class="kpi-lbl">${label}</div>
    <div class="kpi-val ${klasse}">${waarde}</div>
    ${sub ? `<div class="kpi-sub">${sub}</div>` : ''}
  </div>`;
}

function leegVlak(titel, tekst) {
  return `<div class="empty">
    <div class="empty-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg></div>
    <div class="empty-title">${titel}</div>
    <div class="empty-text">${tekst}</div>
  </div>`;
}

export function renderHome() {
  const homeTX = getHomeTX();
  const jaar = state.huidigJaar;
  const jaarTekst = jaar === 'all' ? 'alle jaren' : jaar;

  // ---------- Hoofdcijfers ----------
  let metrics;
  if (jaar === 'all') {
    const alleTx = [...state.HIST_TX, ...state.TX];
    const jaren = [...new Set(alleTx.map(t => t.datum.slice(0, 4)))];
    metrics = jaren.reduce((acc, j) => {
      const m = berekenJaarMetrics(j, alleTx.filter(t => t.datum.startsWith(j)));
      ['omzet','kosten','omzXt','omzBol','omzHC','priveOp','priveSt','hnviInv'].forEach(k => acc[k] = (acc[k] || 0) + m[k]);
      acc.uitExcel = acc.uitExcel && m.uitExcel;
      return acc;
    }, { uitExcel: jaren.length > 0 });
  } else {
    metrics = berekenJaarMetrics(jaar, homeTX);
  }

  const { omzet, kosten, omzXt, omzBol, omzHC, priveOp, priveSt, hnviInv, uitExcel } = metrics;
  const winst = omzet - kosten;
  const bank = berekenBanksaldo(jaar);
  const voorraad = berekenVoorraad();
  const ib = calcIB(winst);
  const reservering = Math.max(0, Math.round(winst * 0.30));

  const bronMerk = uitExcel
    ? '<span class="badge badge-green" title="Overgenomen uit de Per Periode-totalen van je Excel-import">Excel</span>'
    : '';

  document.getElementById('home-kpi').innerHTML =
    kpi(`Omzet ${jaarTekst} ${bronMerk}`, fmt(omzet), 'pos',
        `Xtenate ${fmt(omzXt)} · Bol ${fmt(omzBol)} · Helmetstore ${fmt(omzHC)}`) +
    kpi('Totale kosten', fmt(kosten), 'neg',
        hnviInv > 0 ? `waarvan ${fmt(hnviInv)} HNVI-inkoop` : '') +
    kpi('Netto winst', fmt(winst), winst >= 0 ? 'pos' : 'neg',
        omzet > 0 ? `marge ${Math.round(winst / omzet * 100)}%` : '') +
    kpi('Banksaldo', bank.saldo === null ? '—' : fmt(bank.saldo),
        bank.saldo !== null && bank.saldo < 0 ? 'neg' : '', bank.label);

  document.getElementById('home-kpi2').innerHTML =
    kpi('Privé-opnames', fmt(priveOp), 'muted', '', ' kpi--secondary') +
    kpi('Privé-stortingen', fmt(priveSt), 'muted', '', ' kpi--secondary') +
    kpi(ib <= 0 ? 'Geschatte teruggave' : 'Geschatte inkomstenbelasting',
        (ib <= 0 ? '+' : '') + fmt(Math.abs(Math.round(ib))),
        ib <= 0 ? 'pos' : 'neg',
        winst > 0 ? `reserveer ± ${fmt(reservering)}` : 'geen winst dit jaar', ' kpi--secondary') +
    kpi('Voorraadwaarde', fmt(voorraad.waarde), '',
        `${voorraad.loten} loten · ${voorraad.covers} covers`, ' kpi--secondary');

  // ---------- Uitschieters ----------
  const topIn = [...homeTX].filter(isInkomst).sort((a, b) => b.bedrag - a.bedrag).slice(0, 2);
  const topUit = [...homeTX].filter(isUitgave).sort((a, b) => b.bedrag - a.bedrag).slice(0, 2);
  const uitschieters = [...topIn, ...topUit];
  document.getElementById('home-uitsch').innerHTML = uitschieters.length
    ? uitschieters.map(t => `
      <div class="uitsch-item row-click" data-id="${esc(t.id)}">
        <div class="uitsch-icon" style="background:${isInkomst(t) ? 'var(--green-bg)' : 'var(--red-bg)'}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${isInkomst(t) ? 'var(--green)' : 'var(--red)'}" stroke-width="2.5">
            ${isInkomst(t)
              ? '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>'
              : '<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>'}
          </svg>
        </div>
        <div class="uitsch-info">
          <div class="uitsch-naam">${esc(weergaveNaam(t))}</div>
          <div class="uitsch-meta">${ddmm(t.datum)} · ${esc(GBNM[t.gb] || t.gb)}</div>
        </div>
        <div class="uitsch-bedrag ${isInkomst(t) ? 'pos' : 'neg'}">${isInkomst(t) ? '+' : '–'}${fmt(t.bedrag)}</div>
      </div>`).join('')
    : `<div class="card" style="grid-column:1/-1;margin:0">${leegVlak('Nog geen boekingen', 'Zodra je een Excel-bestand importeert of een transactie toevoegt, zie je hier de grootste in- en uitgaven.')}</div>`;

  // ---------- Grafieken ----------
  const alleMaanden = [...new Set(homeTX.map(t => t.datum.slice(0, 7)))].sort();
  const maanden = jaar === 'all' ? alleMaanden.slice(-24) : alleMaanden;
  const labels = maanden.map(maandLabel);
  // In één doorloop optellen per maand. Per maand opnieuw door alle boekingen
  // lopen was bij "alle jaren" tienduizenden vergelijkingen voor hetzelfde
  // resultaat.
  const perMaand = new Map(maanden.map(m => [m, { omzet: 0, kosten: 0 }]));
  homeTX.forEach(t => {
    const vak = perMaand.get(t.datum.slice(0, 7));
    if (!vak) return;
    if (isInkomst(t) && isOmzet(t.gb)) vak.omzet += t.bedrag;
    else if (isUitgave(t)) vak.kosten += t.bedrag;
  });
  const omzetD = maanden.map(m => perMaand.get(m).omzet);
  const kostenD = maanden.map(m => perMaand.get(m).kosten);

  let loper = 0;
  const cumulatief = maanden.map((_, i) => (loper += omzetD[i] - kostenD[i]));

  const kleur = palette();

  dc('c-ie');
  if (maanden.length) {
    charts['c-ie'] = new Chart(document.getElementById('c-ie'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Omzet', data: omzetD, backgroundColor: kleur[1], borderRadius: 3, maxBarThickness: 26 },
          { label: 'Kosten', data: kostenD, backgroundColor: kleur[2], borderRadius: 3, maxBarThickness: 26 }
        ]
      },
      options: baseOpts({ yFmt: fmtKort })
    });
  }

  dc('c-net');
  if (maanden.length) {
    charts['c-net'] = new Chart(document.getElementById('c-net'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Winst, opgeteld',
          data: cumulatief,
          borderColor: kleur[0],
          backgroundColor: 'transparent',
          tension: .3,
          borderWidth: 2,
          pointRadius: maanden.length > 18 ? 0 : 3,
          pointBackgroundColor: kleur[0]
        }]
      },
      options: baseOpts({ yFmt: fmtKort })
    });
  }

  // Kostenverdeling per grootboekrekening
  const perGb = {};
  homeTX.filter(isUitgave).forEach(t => { perGb[t.gb] = (perGb[t.gb] || 0) + t.bedrag; });
  const gesorteerd = Object.entries(perGb).sort((a, b) => b[1] - a[1]);
  const top = gesorteerd.slice(0, 5);
  const restBedrag = gesorteerd.slice(5).reduce((s, [, v]) => s + v, 0);
  const kostLabels = top.map(([gb]) => GBNM[gb] || gb).concat(restBedrag > 0 ? ['Overig'] : []);
  const kostData = top.map(([, v]) => v).concat(restBedrag > 0 ? [restBedrag] : []);

  dc('c-kosten');
  const kostenCanvas = document.getElementById('c-kosten');
  const kostenLeeg = document.getElementById('c-kosten-leeg');
  if (kostData.length) {
    kostenCanvas.style.display = '';
    kostenLeeg.innerHTML = kostLabels.map((n, i) =>
      `<span style="display:flex;align-items:center;gap:6px"><span style="width:9px;height:9px;border-radius:2px;background:${kleur[i % kleur.length]}"></span>${esc(n)} ${fmt(kostData[i])}</span>`).join('');
    charts['c-kosten'] = new Chart(kostenCanvas, {
      type: 'doughnut',
      data: { labels: kostLabels, datasets: [{ data: kostData, backgroundColor: kleur, borderWidth: 0 }] },
      options: {
        ...baseOpts({ legend: false }),
        cutout: '64%',
        scales: {}
      }
    });
  } else {
    kostenCanvas.style.display = 'none';
    kostenLeeg.innerHTML = '<span class="muted" style="font-size:12.5px">Nog geen kosten geboekt in deze periode.</span>';
  }

  // ---------- Laatste boekingen ----------
  const recent = [...homeTX].sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, 8);
  const body = document.getElementById('home-recent');
  body.innerHTML = recent.length
    ? recent.map(t => `<tr class="row-click" data-id="${esc(t.id)}">
        <td class="muted" data-v="${t.datum}">${ddmm(t.datum)}</td>
        <td class="td-trunc">${esc(weergaveNaam(t))}</td>
        <td><span class="gbnr">${esc(t.gb)}</span> ${esc(GBNM[t.gb] || '')}</td>
        <td>${rekBadge(t.rek)}</td>
        <td style="text-align:right" data-v="${t.bedrag}">${typeBadge(t.type, t.bedrag)}</td>
      </tr>`).join('')
    : `<tr data-geen-sort="1"><td colspan="5">${leegVlak('Nog geen boekingen', 'Importeer je Excel-bestand via het menu links, of voeg handmatig een transactie toe op de Bank-pagina.')}</td></tr>`;
  maakSorteerbaar(document.getElementById('tbl-home-recent'));

  // ---------- Laatste voorraadmutaties ----------
  const mutaties = [...state.HNVI_LOTS]
    .filter(l => l.datum)
    .sort((a, b) => b.datum.localeCompare(a.datum))
    .slice(0, 6);
  document.getElementById('home-voorraad').innerHTML = mutaties.length
    ? mutaties.map(l => `<tr>
        <td class="muted">${ddmm(l.datum)}</td>
        <td class="td-trunc">${esc(l.omschr || 'Lot zonder omschrijving')}</td>
        <td><span class="${l.status === 'verkocht' ? 'badge badge-gray' : 'stock-ok'}">${l.status === 'verkocht' ? 'verkocht' : 'op voorraad'}</span></td>
        <td style="text-align:right">${fmt(l.inkoop || 0)}</td>
      </tr>`).join('')
    : `<tr><td colspan="4">${leegVlak('Nog geen loten', 'Voeg loten toe op de HNVI-pagina om je voorraad hier te volgen.')}</td></tr>`;
}
