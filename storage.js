// storage.js — centrale state, localStorage helpers en opslagfuncties
// Fase 1 refactor: identieke logica als het origineel, alleen verplaatst en
// samengevoegd in een gedeeld `state`-object zodat andere modules ernaar kunnen
// verwijzen zonder dat we losse globale variabelen nodig hebben.

// Fase 3A: Import Supabase client v2 (pending queue + RLS)
import { 
  loadBoekingenFromSupabase,
  loadPendingQueue,
  syncPendingQueue,
  pendingQueue,
  isSupabaseReady,
  addToPendingQueue,
  savePendingQueue
} from './supabase-client-v2.js?v=20260821j';

export const state = {
  TX: [],
  COVERS: [],
  HNVI_LOTS: [],
  HIST_TX: [],
  FACTUREN: [],
  nxtTx: 200,
  nxtFactuur: 1,
  editFactuurId: null,
  nxtCover: 100,
  nxtHnvi: 10,
  huidigJaar: '2026',
  editTxId: null,
  editCoverId: null,
  hnviSellId: null,
  hnviLaatsteDatum: null,
  hnviImportItems: [],
  loadedFromSupabase: false  // Track data source
};

export const HIST_TX_DEFAULT = [];
state.HIST_TX = load('xtenate_hist_tx_override', JSON.parse(JSON.stringify(HIST_TX_DEFAULT)));

// De maandsaldi zoals ze in de app zijn vastgelegd. Apart benoemd zodat een
// herstelactie ze binnen dezelfde sessie kan terugzetten, en niet alleen de
// override uit de browser kan weghalen.
export const MAAND_SALDOS_DEFAULT = {};

export let MAAND_SALDOS = load('xtenate_maand_saldos_override', JSON.parse(JSON.stringify(MAAND_SALDOS_DEFAULT)));

// Jaartotalen (omzet, kosten, privé opname/storting, HNVI-inkoop) zoals ingelezen uit het
// "Per Periode"-tabblad van een Excel-import. Deze zijn leidend boven de losse boekingen,
// want ze komen rechtstreeks uit de boekhouding en zijn dus de betrouwbaarste bron.
// Structuur: { "2025": {omzet, kosten, omzXt, omzBol, omzHC, priveOp, priveSt, hnviInv}, ... }
export const HOME_TOTALS_DEFAULT = {};
export let HOME_TOTALS = load('xtenate_home_totals_override', JSON.parse(JSON.stringify(HOME_TOTALS_DEFAULT)));

const TX_INIT = [];

const COVERS_INIT = [];

export function load(key, def) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch(e) { return def; } }

export function save(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      console.error(`Opslag is vol: kan niet meer opslaan. (${e.message})`);
      showStorageError('Opslagruimte vol', 'De browser kan niet meer opslaan. Verwijder oude data of maak ruimte vrij.');
    } else {
      console.error(`Fout bij opslaan: ${e.message}`, e);
      showStorageError('Opslagfout', 'Er is een fout opgetreden bij het opslaan. Herlaad de pagina en probeer opnieuw.');
    }
  }
}

function showStorageError(titel, boodschap) {
  if (typeof window !== 'undefined' && window.alert) {
    alert(`⚠️ ${titel}\n\n${boodschap}`);
  }
}

/** Diepe kopie, zodat werkgegevens en standaardwaarden nooit hetzelfde object zijn. */
export const kopie = v => JSON.parse(JSON.stringify(v));

state.TX = load('xtenate_tx', JSON.parse(JSON.stringify(TX_INIT)));

state.COVERS = load('xtenate_covers', JSON.parse(JSON.stringify(COVERS_INIT)));

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
    // Jaarcijfers van beide kanten samenvoegen: wat al vastgelegd was blijft
    // staan, wat uit het bestand komt wint voor dat ene jaar.
    const jaren = { ...(oud.jaren || {}), ...(c.jaren || {}) };
    if (c.omzet2026 != null && jaren['2026']?.verkocht == null) {
      jaren['2026'] = { eind: jaren['2026']?.eind ?? null, verkocht: c.omzet2026 };
    }
    return {
      ...c,
      categorie: c.categorie || oud.categorie || standaardGroep(),
      inkoopprijs: c.inkoopprijs ?? oud.inkoopprijs ?? null,
      minVoorraad: c.minVoorraad ?? oud.minVoorraad ?? null,
      prijs: c.prijs ?? oud.prijs ?? null,
      jaren
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

/** Bewaart wijzigingen in de historische jaren (2022 t/m 2025). */
export function saveHistTxData() { save('xtenate_hist_tx_override', state.HIST_TX); }

export function saveCoversData() { save('xtenate_covers', state.COVERS); save('xtenate_nxtCover', state.nxtCover); }

export function saveHnviData() { save('xtenate_hnvi', state.HNVI_LOTS); save('xtenate_nxtHnvi', state.nxtHnvi); }

// ─── FACTUREN (fase 7) ─────────────────────────────────────────────────────
// Debiteuren en crediteuren staan naast de boekingen, niet erin. Er is geen
// _DEFAULT: facturen beginnen leeg, er valt niets te herstellen naar standaard.
// Een lege of beschadigde opslag levert dus gewoon een lege lijst op, en de
// bestaande 634 boekingen blijven daarbij onaangeroerd.
state.FACTUREN = load('xtenate_facturen', []);
state.nxtFactuur = load('xtenate_nxt_factuur', 1);

export const FACTUUR_INSTELLINGEN_STANDAARD = {
  betaaltermijnDebiteur: 30,
  betaaltermijnCrediteur: 14,
  waarschuwDagen: 7
};
export let FACTUUR_INSTELLINGEN = load('xtenate_factuur_instellingen',
  JSON.parse(JSON.stringify(FACTUUR_INSTELLINGEN_STANDAARD)));

export function saveFacturen() {
  save('xtenate_facturen', state.FACTUREN);
  save('xtenate_nxt_factuur', state.nxtFactuur);
}

export function saveFactuurInstellingen(nieuwe) {
  if (nieuwe) FACTUUR_INSTELLINGEN = { ...FACTUUR_INSTELLINGEN, ...nieuwe };
  save('xtenate_factuur_instellingen', FACTUUR_INSTELLINGEN);
}

// ─── STATE INITIALISATIE (identiek aan origineel) ──────────────────────────
state.huidigJaar = '2026';
state.hnviSellId = null;
state.editTxId = null;
state.editCoverId = null;
state.editFactuurId = null;
state.hnviLaatsteDatum = new Date().toISOString().split('T')[0];
state.hnviImportItems = [];

// ─── FASE 3A: HYBRID DATA LOADING ────────────────────────────────────────
/**
 * Load boekingen from Supabase OR localStorage (fallback)
 * Called after auth is complete
 * 
 * Flow:
 * 1. Try Supabase (RLS filters to current user)
 * 2. If fail/timeout: Fall back to localStorage
 * 3. Load pending queue for recovery
 * 4. Retry syncing pending items
 */
export async function loadDataHybrid() {
  console.log('📦 Loading data (hybrid: Supabase → localStorage fallback)...');
  
  // Try Supabase first
  if (isSupabaseReady()) {
    try {
      console.log('🔄 Attempting to load from Supabase...');
      const result = await loadBoekingenFromSupabase();
      
      if (result && (result.TX.length > 0 || result.HIST_TX.length > 0)) {
        state.TX = result.TX;
        state.HIST_TX = result.HIST_TX;
        state.loadedFromSupabase = true;
        console.log(`✅ Data loaded from Supabase: ${state.TX.length} TX + ${state.HIST_TX.length} HIST_TX`);
      } else if (result) {
        // Empty result but no error = first time or no data
        console.log('ℹ️  Supabase empty (first time?), loading from localStorage');
        state.TX = load('xtenate_tx', JSON.parse(JSON.stringify(TX_INIT)));
        state.HIST_TX = load('xtenate_hist_tx_override', JSON.parse(JSON.stringify(HIST_TX_DEFAULT)));
        state.loadedFromSupabase = false;
      }
    } catch (err) {
      console.warn(`⚠️  Supabase load failed: ${err.message}, falling back to localStorage`);
      state.TX = load('xtenate_tx', JSON.parse(JSON.stringify(TX_INIT)));
      state.HIST_TX = load('xtenate_hist_tx_override', JSON.parse(JSON.stringify(HIST_TX_DEFAULT)));
      state.loadedFromSupabase = false;
    }
  } else {
    // Supabase not ready
    console.log('⚠️  Supabase not ready, loading from localStorage');
    state.TX = load('xtenate_tx', JSON.parse(JSON.stringify(TX_INIT)));
    state.HIST_TX = load('xtenate_hist_tx_override', JSON.parse(JSON.stringify(HIST_TX_DEFAULT)));
    state.loadedFromSupabase = false;
  }
  
  // Load pending queue (recovery from offline changes)
  loadPendingQueue();
  const pendingCount = Object.keys(pendingQueue).length;
  if (pendingCount > 0) {
    console.log(`⏳ Found ${pendingCount} pending items, attempting sync...`);
    await syncPendingQueue().catch(err => 
      console.warn('Pending sync failed:', err)
    );
  }
  
  console.log('✅ Data loading complete');
}
