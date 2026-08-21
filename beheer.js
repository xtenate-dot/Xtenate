// beheer.js — de pagina Beheer: gegevens, onderhoud en systeem.
//
// Deze acties zaten alleen in de zijbalk, als negen losse regels zonder
// ordening. Hier staan ze gegroepeerd, met Controle erbij. De acties zelf zijn
// ongewijzigd: elke tegel roept dezelfde globale functie aan als het
// zijbalk-item, dus er verandert niets aan wat ze doen.

import { draaiControles } from './controle.js?v=20260821m';
import { esc } from './helpers.js?v=20260821m';

const el = id => document.getElementById(id);

const I = {
  controle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>',
  import: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  export: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  sync: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>',
  gegevens: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h9"/></svg>',
  herstel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3v12"/><path d="m8 11 4 4 4-4"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>',
  migratie: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 6a8 3 0 1016 0 8 3 0 10-16 0"/><path d="M4 6v6a8 3 0 0016 0V6"/><path d="M4 12v6a8 3 0 0016 0v-6"/></svg>',
  diagnose: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>',
  zelftest: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 3h6M10 3v6.5L5.5 18a2 2 0 001.7 3h9.6a2 2 0 001.7-3L14 9.5V3"/></svg>',
  sleutel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>',
  wissen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>'
};

function controleMerk() {
  try {
    const regels = draaiControles();
    const fout = regels.filter(r => r.ernst === 'fout' && !r.ok).length;
    const waarschuwing = regels.filter(r => r.ernst === 'waarschuwing' && !r.ok).length;
    if (fout) return { soort: 'fout', tekst: `${fout} te doen` };
    if (waarschuwing) return { soort: 'waarschuwing', tekst: `${waarschuwing} let op` };
    return { soort: 'info', tekst: 'in orde' };
  } catch (e) {
    console.error('Controles konden niet worden gedraaid voor de beheerpagina:', e);
    return null;
  }
}

function tegel({ titel, uitleg, icoon, pagina, actie, merk = null, gevaarlijk = false }) {
  const doel = pagina ? `gaNaar('${pagina}')` : actie;
  const merkje = merk
    ? `<span class="home-tegel-merk home-tegel-merk-${merk.soort}">${esc(merk.tekst)}</span>`
    : '';
  return `
    <button type="button" class="home-tegel${gevaarlijk ? ' home-tegel-gevaar' : ''}"
            onclick="${doel}" aria-label="${esc(titel)} — ${esc(uitleg)}">
      <span class="home-tegel-kop">
        <span class="home-tegel-icoon">${icoon}</span>
        ${merkje}
      </span>
      <span class="home-tegel-titel">${esc(titel)}</span>
      <span class="home-tegel-uitleg">${esc(uitleg)}</span>
    </button>`;
}

function groep(naam, tegels) {
  return `
    <div class="beheer-groep">
      <div class="beheer-groep-kop">${esc(naam)}</div>
      <div class="home-tegels">${tegels.join('')}</div>
    </div>`;
}

export function renderBeheer() {
  const doel = el('beheer-inhoud');
  if (!doel) return;

  doel.innerHTML =
    groep('Administratie', [
      tegel({
        titel: 'Controle', uitleg: 'Controlepunten in je administratie',
        icoon: I.controle, pagina: 'controle', merk: controleMerk()
      }),
      tegel({
        titel: 'Importeer Excel', uitleg: 'Boekingen inlezen uit een Excel-bestand',
        icoon: I.import, actie: "document.getElementById('import-file').click()"
      }),
      tegel({
        titel: 'Exporteer Excel', uitleg: 'Je administratie wegschrijven naar Excel',
        icoon: I.export, actie: 'openExportModal()'
      }),
      tegel({
        titel: 'Cloud sync', uitleg: 'Gegevens uitwisselen met de cloud',
        icoon: I.sync, actie: 'openSyncModal()'
      })
    ]) +
    groep('Voorzichtig', [
      tegel({
        titel: 'Data wissen', uitleg: 'Alles verwijderen uit deze browser — niet ongedaan te maken!',
        icoon: I.wissen, actie: 'openWisModal()', gevaarlijk: true
      })
    ]);
}
