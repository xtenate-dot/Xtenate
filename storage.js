// storage.js — centrale state, localStorage helpers en opslagfuncties
// Fase 1 refactor: identieke logica als het origineel, alleen verplaatst en
// samengevoegd in een gedeeld `state`-object zodat andere modules ernaar kunnen
// verwijzen zonder dat we losse globale variabelen nodig hebben.

export const state = {
  TX: [],
  COVERS: [],
  HNVI_LOTS: [],
  HIST_TX: [],
  nxtTx: 200,
  nxtCover: 100,
  nxtHnvi: 10,
  huidigJaar: '2026',
  editTxId: null,
  editCoverId: null,
  hnviSellId: null,
  hnviLaatsteDatum: null,
  hnviImportItems: []
};

export const HIST_TX_DEFAULT = [];
state.HIST_TX = load('xtenate_hist_tx_override', HIST_TX_DEFAULT);

export let MAAND_SALDOS = load('xtenate_maand_saldos_override', {});

// Jaartotalen (omzet, kosten, privé opname/storting, HNVI-inkoop) zoals ingelezen uit het
// "Per Periode"-tabblad van een Excel-import. Deze zijn leidend boven de losse boekingen,
// want ze komen rechtstreeks uit de boekhouding en zijn dus de betrouwbaarste bron.
// Structuur: { "2025": {omzet, kosten, omzXt, omzBol, omzHC, priveOp, priveSt, hnviInv}, ... }
export const HOME_TOTALS_DEFAULT = {};
export let HOME_TOTALS = load('xtenate_home_totals_override', HOME_TOTALS_DEFAULT);

const TX_INIT = [];

const COVERS_INIT = [];

export function load(key, def) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch(e) { return def; } }

export function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {} }

state.TX = load('xtenate_tx', TX_INIT);

state.COVERS = load('xtenate_covers', COVERS_INIT);

// Voorraadartikelen van vóór de categorie-indeling aanvullen. Alles wat er al
// stond is een Funny Cover; inkoopprijs en minimumvoorraad blijven leeg tot ze
// zijn ingevuld, zodat de app niet met verzonnen waarden gaat rekenen.
export const GROEPEN_STANDAARD = [
  { id: 'covers', naam: 'Funny Covers' },
  { id: 'hoezen', naam: 'Hoezen' },
  { id: 'pophouders', naam: 'Pop Houders' },
  { id: 'accessoires', naam: 'Accessoires' },
  { id: 'overig', naam: 'Overig' }
];

export const STANDAARD_MIN_VOORRAAD = 3;

// Productgroepen zijn zelf te beheren, dus ze staan in de opslag en niet vast
// in de code. De vijf hierboven zijn alleen het vertrekpunt.
state.GROEPEN = load('xtenate_voorraad_groepen', GROEPEN_STANDAARD)
  .filter(g => g && g.id && g.naam);
if (!state.GROEPEN.length) state.GROEPEN = [...GROEPEN_STANDAARD];

export function saveGroepen() { save('xtenate_voorraad_groepen', state.GROEPEN); }

/** De groep waar artikelen in vallen als er niets anders bekend is. */
export function standaardGroep() {
  return state.GROEPEN.some(g => g.id === 'covers') ? 'covers' : state.GROEPEN[0].id;
}

export function groepNaam(id) {
  return state.GROEPEN.find(g => g.id === id)?.naam || id || '—';
}

/** Maakt van een naam een bruikbaar, uniek id. */
export function groepId(naam) {
  const basis = String(naam).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'groep';
  let id = basis, n = 2;
  while (state.GROEPEN.some(g => g.id === id)) id = `${basis}-${n++}`;
  return id;
}

/**
 * Vult ontbrekende voorraadvelden aan. Draait niet alleen bij het opstarten,
 * maar ook na een Excel-import of cloud-download: die vervangen de hele lijst
 * en zouden je indeling anders elke keer wissen. `vorige` is de lijst zoals
 * die er vóór de vervanging uitzag, zodat groep, inkoopprijs en meldgrens
 * behouden blijven — gekoppeld op id, en anders op artikelnaam.
 */
export function normaliseerVoorraad(lijst, vorige = []) {
  const opId = new Map(vorige.map(c => [String(c.id), c]));
  const opNaam = new Map(vorige.map(c => [String(c.artikel || '').trim().toLowerCase(), c]));
  return (lijst || []).map(c => {
    const oud = opId.get(String(c.id)) || opNaam.get(String(c.artikel || '').trim().toLowerCase()) || {};
    return {
      ...c,
      categorie: c.categorie || oud.categorie || standaardGroep(),
      inkoopprijs: c.inkoopprijs ?? oud.inkoopprijs ?? null,
      minVoorraad: c.minVoorraad ?? oud.minVoorraad ?? null,
      prijs: c.prijs ?? oud.prijs ?? null
    };
  });
}

state.COVERS = normaliseerVoorraad(state.COVERS);

state.HNVI_LOTS = load('xtenate_hnvi', []);

state.HNVI_LOTS = state.HNVI_LOTS.map((i,idx) => ({...i, _key: i._key || String(i.id || idx)}));

state.nxtTx = load('xtenate_nxtTx', 200);

state.nxtCover = load('xtenate_nxtCover', 100);

state.nxtHnvi = load('xtenate_nxtHnvi', 10);

export function saveTxData() { save('xtenate_tx', state.TX); save('xtenate_nxtTx', state.nxtTx); }

export function saveCoversData() { save('xtenate_covers', state.COVERS); save('xtenate_nxtCover', state.nxtCover); }

export function saveHnviData() { save('xtenate_hnvi', state.HNVI_LOTS); save('xtenate_nxtHnvi', state.nxtHnvi); }

// ─── STATE INITIALISATIE (identiek aan origineel) ──────────────────────────
state.huidigJaar = '2026';
state.hnviSellId = null;
state.editTxId = null;
state.editCoverId = null;
state.hnviLaatsteDatum = new Date().toISOString().split('T')[0];
state.hnviImportItems = [];
