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

state.HIST_TX = load('xtenate_hist_tx_override', []);

export let MAAND_SALDOS = load('xtenate_maand_saldos_override', {});

const TX_INIT = [];

const COVERS_INIT = [];

export function load(key, def) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch(e) { return def; } }

export function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {} }

state.TX = load('xtenate_tx', TX_INIT);

state.COVERS = load('xtenate_covers', COVERS_INIT);

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
