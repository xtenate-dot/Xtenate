// boekingen-relaties.js — fase 4b-1 van de facturenmodule: bestaande
// boekingen aan relaties (fase 4a) koppelen.
//
// Alleen de eenvoudigste, veiligste vorm: boekingen waarvan `naam` letterlijk
// dezelfde IBAN is, worden als één cluster voorgesteld — geen tekstgelijkenis,
// geen gb/bedrag-brug. Dat is bewust voor een latere fase (4b-2/4b-3) gelaten.
//
// Dit bestand berekent alleen suggesties (puur lezend, state.TX/HIST_TX
// worden hier nooit aangepast) en voert pas een schrijfactie uit als de
// aanroeper een expliciet bevestigd cluster met zijn precieze boekingen-lijst
// aanlevert. Bevestigen herzoekt nooit live op IBAN — dat zou ook boekingen
// kunnen raken die niet in het cluster zaten dat de gebruiker heeft gezien
// (bijv. een boeking met dezelfde IBAN die ondertussen in een ander, nog
// niet-bevestigd cluster staat).

import { state, saveTxData, saveHistTxData, save, load } from './storage.js?v=20260902a';
import { isIban } from './helpers.js?v=20260902a';
import { saveToSupabase, addToPendingQueue } from './supabase-client-v2.js?v=20260902a';

// ───────────────────────────────────────── afgewezen clusters (lokaal, per IBAN)
// Puur een "vraag me hier niet nog eens naar"-voorkeur, geen boekingdata zelf
// — dat mag prima alleen lokaal blijven, net als bijv. een klapstatus in de
// UI. Er wordt hierdoor nooit een boeking gewijzigd, alleen een suggestie
// onderdrukt.
state.AFGEWEZEN_IBAN_CLUSTERS = load('xtenate_afgewezen_iban_clusters', []);

function saveAfgewezenIbanClusters() {
  save('xtenate_afgewezen_iban_clusters', state.AFGEWEZEN_IBAN_CLUSTERS);
}

export function isIbanClusterAfgewezen(iban) {
  return state.AFGEWEZEN_IBAN_CLUSTERS.includes(iban);
}

export function afwijsIbanCluster(iban) {
  if (!state.AFGEWEZEN_IBAN_CLUSTERS.includes(iban)) {
    state.AFGEWEZEN_IBAN_CLUSTERS.push(iban);
    saveAfgewezenIbanClusters();
  }
}

/** Haalt een eerder afgewezen cluster weer naar voren, voor als je van
 *  gedachten verandert. Wijzigt nog steeds geen enkele boeking. */
export function herstelIbanCluster(iban) {
  state.AFGEWEZEN_IBAN_CLUSTERS = state.AFGEWEZEN_IBAN_CLUSTERS.filter(x => x !== iban);
  saveAfgewezenIbanClusters();
}

export function afgewezenIbanClusters() {
  return [...state.AFGEWEZEN_IBAN_CLUSTERS];
}

// ───────────────────────────────────────────────────── clusters berekenen

/**
 * Puur lezend: groepeert boekingen waarvan `naam` exact dezelfde IBAN is
 * (hoofdletterongevoelig vergeleken, IBAN's horen toch al in hoofdletters te
 * staan). Boekingen die al een relatieId hebben, of waarvan het cluster al
 * is afgewezen, worden overgeslagen — die hebben geen voorstel meer nodig.
 *
 * @returns {Array<{iban:string, boekingen:Array, aantal:number, totaal:number,
 *                   vanDatum:string, totDatum:string}>} gesorteerd op aantal, aflopend
 */
export function berekenIbanClusters() {
  const alles = [
    ...(state.TX || []).map(b => ({ ...b, _hist: false })),
    ...(state.HIST_TX || []).map(b => ({ ...b, _hist: true }))
  ];

  const groepen = new Map();
  for (const b of alles) {
    if (b.relatieId) continue;
    const naam = String(b.naam || '').trim();
    if (!isIban(naam)) continue;
    const sleutel = naam.toUpperCase();
    if (!groepen.has(sleutel)) groepen.set(sleutel, []);
    groepen.get(sleutel).push(b);
  }

  const clusters = [];
  for (const [iban, boekingen] of groepen) {
    if (isIbanClusterAfgewezen(iban)) continue;
    const gesorteerd = [...boekingen].sort((a, b) => String(a.datum).localeCompare(String(b.datum)));
    clusters.push({
      iban,
      boekingen: gesorteerd,
      aantal: gesorteerd.length,
      totaal: gesorteerd.reduce((s, b) => s + (Number(b.bedrag) || 0), 0),
      vanDatum: gesorteerd[0]?.datum || '',
      totDatum: gesorteerd[gesorteerd.length - 1]?.datum || ''
    });
  }

  clusters.sort((a, b) => b.aantal - a.aantal);
  return clusters;
}

// ───────────────────────────────────────────────────────── cluster bevestigen

/**
 * Zet relatieId op precies de meegegeven boekingen — nooit een live
 * herzoeken op IBAN. `boekingRefs` moet een array van boekingsobjecten zijn
 * met minstens {id, _hist}, exact zoals ze in het scherm zijn getoond (na een
 * eventuele Aanpassen-uitsluiting). Raakt uitsluitend deze boekingen: geen
 * andere boeking, ook niet één met toevallig dezelfde IBAN in een ander,
 * nog niet-bevestigd cluster.
 *
 * @returns {{ok:boolean, aantalBijgewerkt:number}}
 */
export async function bevestigIbanCluster(boekingRefs, relatieId) {
  if (!relatieId || !Array.isArray(boekingRefs) || !boekingRefs.length) {
    return { ok: false, aantalBijgewerkt: 0 };
  }

  let txGeraakt = false, histGeraakt = false, aantalBijgewerkt = 0;

  for (const ref of boekingRefs) {
    const hist = !!ref._hist;
    const bron = hist ? state.HIST_TX : state.TX;
    const pos = (bron || []).findIndex(t => String(t.id) === String(ref.id));
    if (pos === -1) continue; // ondertussen elders verwijderd: overslaan, niet vastlopen

    bron[pos] = { ...bron[pos], relatieId };
    hist ? (histGeraakt = true) : (txGeraakt = true);
    aantalBijgewerkt++;

    try {
      const ok = await saveToSupabase(bron[pos], hist);
      if (!ok) addToPendingQueue(bron[pos], 'update', hist);
    } catch (err) {
      console.warn('Supabase niet bereikbaar bij koppelen relatie, in wachtrij gezet:', err);
      addToPendingQueue(bron[pos], 'update', hist);
    }
  }

  if (txGeraakt) saveTxData();
  if (histGeraakt) saveHistTxData();

  return { ok: aantalBijgewerkt > 0, aantalBijgewerkt };
}
