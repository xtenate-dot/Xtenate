// herstel.js — de historische boekingen terughalen die door een import zijn
// afgedekt, zonder iets kwijt te raken.
//
// Uitgangspunt: er wordt niets vervangen, er wordt samengevoegd. De standaard
// uit de code is de basis; alles wat daarnaast alleen in jouw browser staat
// blijft behouden. Zo kan de herstelactie nooit boekingen verwijderen die jij
// zelf hebt toegevoegd.
//
// Er gebeurt pas iets bij `voerHerstelUit`, en die maakt eerst een volledige
// reservekopie van alle opslagsleutels.

import {
  HIST_TX_DEFAULT, HOME_TOTALS, HOME_TOTALS_DEFAULT, MAAND_SALDOS, MAAND_SALDOS_DEFAULT, save, state
} from './storage.js?v=20260806a';

const HISTORISCHE_JAREN = ['2022', '2023', '2024', '2025'];
const HUIDIG_JAAR = '2026';

/** Alle sleutels die deze app in de browser gebruikt. */
export const OPSLAGSLEUTELS = [
  'xtenate_tx', 'xtenate_hist_tx_override', 'xtenate_covers', 'xtenate_hnvi',
  'xtenate_voorraad_groepen', 'xtenate_maand_saldos_override',
  'xtenate_home_totals_override', 'xtenate_controle_negeer',
  'xtenate_nxtTx', 'xtenate_nxtCover', 'xtenate_thema', 'xtenate_menu_ingeklapt'
];

/**
 * Kenmerk waarop twee boekingen dezelfde zijn. Bewust zonder id: de ids
 * verschillen tussen de code en een import, terwijl het om dezelfde boeking
 * gaat. Zonder deze vergelijking zou samenvoegen alles verdubbelen.
 */
const kenmerk = t => [
  t.datum, Number(t.bedrag).toFixed(2), t.gb, t.rek, t.type,
  String(t.naam || '').trim().toLowerCase(),
  String(t.omschr || '').trim().toLowerCase()
].join('|');

const jaarVan = t => String(t.datum || '').slice(0, 4);

/** Telt hoe vaak elk kenmerk voorkomt. */
function tel(lijst) {
  const uit = new Map();
  lijst.forEach(t => uit.set(kenmerk(t), (uit.get(kenmerk(t)) || 0) + 1));
  return uit;
}

// ------------------------------------------------------------------ preview

/**
 * Rekent uit wat een herstel zou opleveren, zonder iets te wijzigen.
 * Per jaar wordt getoond wat er nu is, wat de code heeft, en wat eruit komt.
 */
export function herstelPreview() {
  const nuHistorisch = state.HIST_TX;
  const nuHuidig = state.TX;

  const jaren = HISTORISCHE_JAREN.map(jaar => {
    const inApp = nuHistorisch.filter(t => jaarVan(t) === jaar);
    const inCode = HIST_TX_DEFAULT.filter(t => jaarVan(t) === jaar);

    const appTelling = tel(inApp);
    const codeTelling = tel(inCode);

    // Samenvoegen op aantal, niet op aanwezigheid. Twee identieke PostNL-regels
    // op dezelfde dag zijn allebei echt; die mogen niet tot één worden
    // samengevouwen. Per kenmerk houden we daarom het hoogste van beide aantallen.
    const regels = [...inCode];
    const extra = [];
    const teVeelInApp = [];
    appTelling.forEach((aantalApp, k) => {
      const aantalCode = codeTelling.get(k) || 0;
      if (aantalApp > aantalCode) {
        const kandidaten = inApp.filter(t => kenmerk(t) === k).slice(aantalCode);
        extra.push(...kandidaten);
        if (aantalCode > 0) teVeelInApp.push(k);
      }
    });
    regels.push(...extra);

    // Alleen ter informatie: regels die in de app vaker voorkomen dan één keer.
    let dubbelInApp = 0;
    appTelling.forEach(n => { if (n > 1) dubbelInApp += n - 1; });

    // Alleen in de code: kenmerken die in de app helemaal niet voorkomen.
    let alleenInCode = 0;
    codeTelling.forEach((n, k) => { if (!appTelling.has(k)) alleenInCode += n; });

    return {
      jaar,
      nu: inApp.length,
      inCode: inCode.length,
      dubbelInApp,
      alleenInApp: extra.length,
      alleenInAppVoorbeelden: extra.slice(0, 5).map(beschrijf),
      alleenInCode,
      na: regels.length,
      regels
    };
  });

  // 2026 blijft ongemoeid, maar we melden wel wat er in die bak staat.
  const huidigTelling = tel(nuHuidig);
  let dubbelIn2026 = 0;
  huidigTelling.forEach(n => { if (n > 1) dubbelIn2026 += n - 1; });
  const buitenJaar = nuHuidig.filter(t => jaarVan(t) !== HUIDIG_JAAR);
  const perJaarIn2026Bak = {};
  nuHuidig.forEach(t => { const j = jaarVan(t) || 'geen datum'; perJaarIn2026Bak[j] = (perJaarIn2026Bak[j] || 0) + 1; });

  // Jaartotalen: alleen jaren waar de standaard afwijkt van wat er nu staat.
  const jaartotalen = [...new Set([...Object.keys(HOME_TOTALS), ...Object.keys(HOME_TOTALS_DEFAULT)])]
    .sort().map(jaar => {
      const nu = HOME_TOTALS[jaar] || {};
      const na = HOME_TOTALS_DEFAULT[jaar];
      const velden = ['omzet', 'kosten', 'priveOp', 'priveSt'];
      return {
        jaar,
        heeftStandaard: !!na,
        nu: Object.fromEntries(velden.map(v => [v, nu[v] ?? null])),
        na: na ? Object.fromEntries(velden.map(v => [v, na[v] ?? null])) : null,
        wijzigt: !!na && velden.some(v => Math.abs((nu[v] ?? 0) - (na[v] ?? 0)) > 0.01)
      };
    });

  const maandenNu = Object.keys(MAAND_SALDOS).length;

  return {
    jaren,
    totaalNu: nuHistorisch.length + nuHuidig.length,
    totaalNa: jaren.reduce((s, j) => s + j.na, 0) + nuHuidig.length,
    huidigJaar: {
      aantal: nuHuidig.length,
      dubbel: dubbelIn2026,
      buitenJaar: buitenJaar.length,
      buitenJaarVoorbeelden: buitenJaar.slice(0, 5).map(beschrijf),
      perJaar: perJaarIn2026Bak
    },
    jaartotalen,
    maandsaldi: { nu: maandenNu, na: Object.keys(MAAND_SALDOS_DEFAULT).length },
    onaangeroerd: {
      voorraadartikelen: state.COVERS.length,
      productgroepen: state.GROEPEN.length,
      hnviLoten: state.HNVI_LOTS.length,
      genegeerdeMeldingen: aantalNegeerRegels()
    }
  };
}

const beschrijf = t => `${t.datum} · ${t.naam || t.omschr || '(geen naam)'} · ${Number(t.bedrag).toFixed(2)}`;

function aantalNegeerRegels() {
  try {
    const ruw = localStorage.getItem('xtenate_controle_negeer');
    if (!ruw) return 0;
    const d = JSON.parse(ruw);
    return Object.keys(d.meldingen || {}).length + Object.keys(d.controles || {}).length;
  } catch { return 0; }
}

// ------------------------------------------------------------- reservekopie

/** Zet alle opslagsleutels weg onder één sleutel met tijdstempel. */
export function maakOpslagReservekopie() {
  const inhoud = {};
  OPSLAGSLEUTELS.forEach(s => {
    const waarde = localStorage.getItem(s);
    if (waarde !== null) inhoud[s] = waarde;
  });
  const naam = 'xtenate_backup_' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '');
  localStorage.setItem(naam, JSON.stringify({ gemaakt: new Date().toISOString(), inhoud }));
  return { naam, sleutels: Object.keys(inhoud).length, tekens: JSON.stringify(inhoud).length };
}

/** Alle reservekopieën die in deze browser staan. */
export function reservekopieen() {
  const uit = [];
  for (let i = 0; i < localStorage.length; i++) {
    const sleutel = localStorage.key(i);
    if (!sleutel?.startsWith('xtenate_backup_')) continue;
    try {
      const d = JSON.parse(localStorage.getItem(sleutel));
      uit.push({ sleutel, gemaakt: d.gemaakt, sleutels: Object.keys(d.inhoud || {}).length });
    } catch { uit.push({ sleutel, gemaakt: '?', sleutels: 0 }); }
  }
  return uit.sort((a, b) => b.sleutel.localeCompare(a.sleutel));
}

/** Zet een eerdere reservekopie helemaal terug. */
export function zetReservekopieTerug(sleutel) {
  const ruw = localStorage.getItem(sleutel);
  if (!ruw) throw new Error('Deze reservekopie bestaat niet meer.');
  const { inhoud } = JSON.parse(ruw);
  OPSLAGSLEUTELS.forEach(s => localStorage.removeItem(s));
  Object.entries(inhoud).forEach(([s, waarde]) => localStorage.setItem(s, waarde));
  return Object.keys(inhoud).length;
}

// --------------------------------------------------------------- uitvoeren

/**
 * Voert het herstel uit. Maakt eerst een reservekopie, past dan de historie,
 * de jaartotalen en de maandsaldi aan. Raakt 2026, de voorraad, de HNVI-loten
 * en de genegeerde meldingen niet aan.
 */
export function voerHerstelUit() {
  const reservekopie = maakOpslagReservekopie();
  const preview = herstelPreview();

  // Historie: de samengevoegde regels uit de preview.
  const nieuweHistorie = preview.jaren.flatMap(j => j.regels);
  state.HIST_TX = nieuweHistorie;
  save('xtenate_hist_tx_override', state.HIST_TX);

  // Jaartotalen terug naar de standaard, met positieve privébedragen.
  Object.keys(HOME_TOTALS).forEach(k => delete HOME_TOTALS[k]);
  Object.assign(HOME_TOTALS, JSON.parse(JSON.stringify(HOME_TOTALS_DEFAULT)));
  save('xtenate_home_totals_override', HOME_TOTALS);

  // Maandsaldi: terug naar de volledige standaard. De sleutel weghalen is niet
  // genoeg — MAAND_SALDOS is al ingeladen, dus die moet ook in het geheugen
  // worden bijgewerkt, anders zie je de oude vier maanden tot je herlaadt.
  Object.keys(MAAND_SALDOS).forEach(k => delete MAAND_SALDOS[k]);
  Object.assign(MAAND_SALDOS, JSON.parse(JSON.stringify(MAAND_SALDOS_DEFAULT)));
  localStorage.removeItem('xtenate_maand_saldos_override');

  return {
    reservekopie,
    historie: state.HIST_TX.length,
    perJaar: preview.jaren.map(j => ({ jaar: j.jaar, aantal: j.na })),
    jaartotalen: Object.keys(HOME_TOTALS).length,
    maandsaldi: Object.keys(MAAND_SALDOS).length
  };
}
