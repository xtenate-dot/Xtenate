/**
 * supabase-client-v2.js
 * 
 * Supabase layer with:
 * - Pending queue management (reliable sync)
 * - Save/delete with retry logic
 * - Fallback to localStorage
 * - RLS-aware loading
 * - No data loss on offline/failures
 * 
 * Fase 3A Implementation
 */

import { getClient, heeftClient } from './supabase.js?v=20260826b';

// ===== NOODREM =====
export function syncIsAangezet() {
  try {
    return localStorage.getItem('xtenate_sync_aan') === 'ja';
  } catch {
    return false;
  }
}

// ===== PENDING QUEUE STATE =====
export const pendingQueue = {};
const QUEUE_STORAGE_KEY = 'xtenate_pending_queue_v2';

export function savePendingQueue() {
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(pendingQueue));
    console.log(`📝 Saved pending queue (${Object.keys(pendingQueue).length} items)`);
  } catch (err) {
    console.error('Failed to save pending queue:', err);
  }
}

export function loadPendingQueue() {
  try {
    const saved = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!saved) return;
    
    const loaded = JSON.parse(saved);
    Object.assign(pendingQueue, loaded);
    
    const count = Object.keys(pendingQueue).length;
    if (count > 0) {
      console.log(`⏳ Restored ${count} pending items from localStorage`);
    }
  } catch (err) {
    console.error('Failed to load pending queue:', err);
  }
}

export function clearPendingQueueItem(key) {
  delete pendingQueue[key];
  savePendingQueue();
}

export function addToPendingQueue(boeking, operation, isHistoric = false) {
  // De sleutel bevat geen tijdstip meer. Bewerk je hetzelfde artikel drie keer
  // achter elkaar, dan stonden er eerst drie regels in de wachtrij die alle
  // drie verstuurd werden — de eerste twee met verouderde gegevens. Nu
  // vervangt een nieuwe bewerking de vorige, zodat alleen de laatste stand
  // wordt verstuurd.
  const key = `${operation}_${boeking.id}`;

  // Voorraadartikelen en HNVI-loten hebben heel andere velden dan een boeking.
  // Die mogen niet worden teruggeknipt tot boekingsvelden, anders staat er
  // straks een lege regel in de wachtrij en is de wijziging alsnog kwijt.
  const isBoeking = operation !== 'hnvi' && operation !== 'cover';

  let data = null;
  if (operation !== 'delete') {
    data = isBoeking
      ? {
          id: boeking.id,
          datum: boeking.datum,
          bedrag: boeking.bedrag,
          naam: boeking.naam,
          omschr: boeking.omschr,
          type: boeking.type,
          rek: boeking.rek,
          gb: boeking.gb
        }
      : { ...boeking };
  }

  // Verwijderen maakt eerdere wijzigingen op hetzelfde ding zinloos. Die halen
  // we weg, anders zou een oude 'update' het net verwijderde item opnieuw
  // aanmaken.
  if (operation === 'delete') {
    for (const k of Object.keys(pendingQueue)) {
      if (pendingQueue[k].id === boeking.id && pendingQueue[k].operation !== 'delete') {
        delete pendingQueue[k];
      }
    }
  }

  pendingQueue[key] = {
    id: boeking.id,
    operation: operation,
    soort: operation === 'hnvi' ? 'hnvi' : operation === 'cover' ? 'cover' : 'auto',
    isHistoric: isHistoric,
    status: 'pending',
    timestamp: Date.now(),
    attempts: 0,
    maxAttempts: 5,
    data
  };
  
  savePendingQueue();
  console.log(`➕ Added to pending queue: ${operation} ${boeking.id}`);
  
  return key;
}

/**
 * Hoeveel staat er open en hoeveel is er blijven steken? De autosync gebruikt
 * dit om te melden dat er iets niet aankomt, in plaats van stil te blijven
 * proberen.
 */
export function wachtrijStatus() {
  const alles = Object.values(pendingQueue);
  return {
    open: alles.filter(p => p.attempts < (p.maxAttempts || 5)).length,
    vastgelopen: alles.filter(p => p.attempts >= (p.maxAttempts || 5)).length,
    totaal: alles.length
  };
}

/** Zet vastgelopen items terug op nul pogingen, zodat de knop echt opnieuw probeert. */
export function herstartVastgelopen() {
  let aantal = 0;
  for (const p of Object.values(pendingQueue)) {
    if (p.attempts >= (p.maxAttempts || 5)) { p.attempts = 0; p.status = 'pending'; aantal++; }
  }
  if (aantal) savePendingQueue();
  return aantal;
}

// ===== LOAD FROM SUPABASE =====

/**
 * Laad alle HNVI-loten van Supabase
 */
export async function loadHnviFromSupabase() {
  if (!heeftClient()) return [];
  
  try {
    const sb = await getClient();
    
    const { data, error } = await sb
      .from('hnvi_loten')
      .select('*')
      .is('deleted_at', null)
      .order('datum');
    
    if (error) {
      console.warn('⚠️  HNVI load failed:', error.message);
      return [];
    }
    
    if (!data || data.length === 0) return [];
    
    return data.map(lot => ({
      id: parseInt(lot.legacy_id) || lot.legacy_id,
      _key: String(lot.legacy_id),
      datum: lot.datum,
      omschr: lot.omschrijving,
      inkoop: lot.inkoop,
      verkoop: lot.verkoop,
      status: lot.status,
      noot: lot.notitie,
      factuur: lot.factuur || '',
      verkoopDatum: lot.verkoopdatum || ''
    }));
  } catch (err) {
    console.warn('Error in loadHnviFromSupabase:', err);
    return [];
  }
}

/**
 * Laad alle Covers (voorraadartikelen) van Supabase
 */
export async function loadCoversFromSupabase() {
  if (!heeftClient()) return [];
  
  try {
    const sb = await getClient();
    
    const { data, error } = await sb
      .from('voorraadartikelen')
      .select('*')
      .is('deleted_at', null)
      .order('artikel');
    
    if (error) {
      console.warn('⚠️  Covers load failed:', error.message);
      return [];
    }
    
    if (!data || data.length === 0) return [];
    
    const huidigJaar = String(new Date().getFullYear());

    return data.map(c => {
      // jaren kan null/leeg zijn uit Supabase (vooral oude records)
      let jaren = {};
      if (c.jaren && typeof c.jaren === 'object') {
        jaren = c.jaren;
      } else if (typeof c.jaren === 'string') {
        try { jaren = JSON.parse(c.jaren); } catch (e) { jaren = {}; }
      }

      // Als jaren leeg is maar we hebben wel ingekochte stuks, probeer ze te reconstrueren
      if (!Object.keys(jaren).length && (c.ingekocht || c.verkocht)) {
        jaren[huidigJaar] = {
          inkoop: c.ingekocht || 0,
          verkocht: c.verkocht || 0,
          eind: c.voorraad || 0
        };
      }

      // Belangrijk: een lege prijs blijft leeg. Zou hier 0 staan, dan telt het
      // artikel mee als "prijs bekend, waarde nul" en klopt de voorraadwaarde niet.
      const ip = c.inkoopprijs == null ? null : Number(c.inkoopprijs);
      const vp = c.verkoopprijs == null ? null : Number(c.verkoopprijs);

      return {
        id: parseInt(c.legacy_id) || c.legacy_id,
        artikel: c.artikel,
        categorie: c.categorie || 'overig',
        inkoop: c.ingekocht || 0,
        inkoopprijs: ip,
        voorraad: c.voorraad || 0,
        prijs: vp,
        omzet2026: c.verkocht || 0,
        zoekterm: c.zoekterm || '',
        minVoorraad: c.min_voorraad,
        handelsvoorraad: c.handelsvoorraad !== false,
        prijsFactor: Number(c.prijsfactor) > 0 ? Number(c.prijsfactor) : 1,
        inkoopGb: c.inkooprekening || '7000',
        jaren
      };
    });
  } catch (err) {
    console.warn('Error in loadCoversFromSupabase:', err);
    return [];
  }
}

export async function loadBoekingenFromSupabase() {
  if (!heeftClient()) {
    console.log('⚠️  Supabase client not initialized');
    return null;
  }
  
  try {
    const sb = await getClient();
    
    const { data, error } = await sb
      .from('boekingen')
      .select('*')
      .is('deleted_at', null)
      .order('datum');
    
    if (error) {
      console.warn('❌ Supabase load failed:', error.message);
      return null;
    }
    
    if (!data || data.length === 0) {
      console.log('ℹ️  No boekingen found in Supabase (empty or first time)');
      return { TX: [], HIST_TX: [] };
    }
    
    const TX = [];
    const HIST_TX = [];
    
    for (const b of data) {
      const record = {
        id: b.archief_jaar === null ? parseInt(b.legacy_id) : b.legacy_id,
        datum: b.datum,
        bedrag: b.bedrag,
        naam: b.naam,
        omschr: b.omschr,
        type: b.type,
        rek: b.rek,
        gb: b.gb
      };
      
      if (b.archief_jaar === null) {
        TX.push(record);
      } else {
        HIST_TX.push(record);
      }
    }
    
    console.log(`✅ Loaded from Supabase: ${TX.length} TX + ${HIST_TX.length} HIST_TX`);
    return { TX, HIST_TX };
    
  } catch (err) {
    console.error('❌ Supabase load error:', err);
    return null;
  }
}

// ===== SAVE TO SUPABASE =====

export async function saveToSupabase(boeking, isHistoric) {
  if (!heeftClient()) {
    console.log('⚠️  Supabase not ready, skipping save');
    return false;
  }
  
  try {
    const sb = await getClient();
    
    // Haal user ID uit Supabase sessie
    const session = await sb.auth.getSession();
    const userId = session?.data?.session?.user?.id;
    
    if (!userId) {
      console.warn('⚠️  No user ID available (not logged in?)');
      return false;
    }
    
    const record = {
      user_id: userId,
      legacy_id: String(boeking.id),
      legacy_source: isHistoric ? 'hist_tx' : 'tx',
      datum: boeking.datum,
      bedrag: parseFloat(boeking.bedrag),
      naam: boeking.naam || null,
      omschr: boeking.omschr || null,
      type: boeking.type,
      rek: boeking.rek,
      gb: boeking.gb,
      archief_jaar: isHistoric ? parseInt(boeking.datum.substring(0, 4)) : null,
      btw_bedrag: 0,
      btw_percentage: 0,
      updated_at: new Date().toISOString()
    };
    
    // Delete old version (MET user_id, dus RLS laat het toe)
    await sb
      .from('boekingen')
      .delete()
      .eq('legacy_id', String(boeking.id))
      .eq('user_id', userId);
    
    // Insert fresh
    const { error } = await sb.from('boekingen').insert([record]);
    
    if (error) {
      console.error(`❌ Supabase save failed (${boeking.id}):`, error);
      return false;
    }
    
    console.log(`✅ Synced to Supabase: ${boeking.id}`);
    return true;
  } catch (err) {
    console.error('Error in saveToSupabase:', err);
    return false;
  }
}

// ===== OVERIGE APPGEGEVENS (groepen, facturen, tellers) =====

/**
 * Groepen, facturen en tellers zijn kleine lijstjes zonder eigen tabel. Ze
 * gaan als één JSON-waarde per sleutel naar de tabel app_data. Zo hoeft er
 * geen apart schema per soort te bestaan en kunnen er later gegevens bij
 * zonder opnieuw een tabel aan te maken.
 */
export async function saveAppData(sleutel, waarde) {
  if (!heeftClient()) return false;
  try {
    const sb = await getClient();
    const session = await sb.auth.getSession();
    const userId = session?.data?.session?.user?.id;
    if (!userId) return false;

    const { error } = await sb.from('app_data').upsert({
      user_id: userId,
      sleutel,
      waarde,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,sleutel' });

    if (error) {
      if (isOnbekendeTabelFout(error)) {
        if (!appDataGemeld) {
          console.warn('⚠️  Tabel app_data bestaat nog niet. Groepen en facturen blijven lokaal.');
          appDataGemeld = true;
        }
        return false;
      }
      console.error(`❌ app_data (${sleutel}):`, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`app_data (${sleutel}) mislukt:`, err.message);
    return false;
  }
}

let appDataGemeld = false;

function isOnbekendeTabelFout(error) {
  const t = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return error?.code === '42P01' || t.includes('does not exist') || t.includes('schema cache');
}

/** Haalt alle losse appgegevens op als { sleutel: waarde }. */
export async function loadAppData() {
  if (!heeftClient()) return null;
  try {
    const sb = await getClient();
    const { data, error } = await sb.from('app_data').select('sleutel, waarde');
    if (error) {
      if (isOnbekendeTabelFout(error)) {
        if (!appDataGemeld) {
          console.warn('⚠️  Tabel app_data bestaat nog niet.');
          appDataGemeld = true;
        }
        return null;
      }
      console.error('❌ app_data laden:', error.message);
      return null;
    }
    const uit = {};
    for (const rij of data || []) uit[rij.sleutel] = rij.waarde;
    return uit;
  } catch (err) {
    console.warn('app_data laden mislukt:', err.message);
    return null;
  }
}

// ===== ALLES IN EEN KEER NAAR SUPABASE =====

/** Bouwt het databaserecord voor een boeking. */
function boekingRecord(boeking, isHistoric, userId) {
  return {
    user_id: userId,
    legacy_id: String(boeking.id),
    legacy_source: isHistoric ? 'hist_tx' : 'tx',
    datum: boeking.datum,
    bedrag: parseFloat(boeking.bedrag),
    naam: boeking.naam || null,
    omschr: boeking.omschr || null,
    type: boeking.type,
    rek: boeking.rek,
    gb: boeking.gb,
    archief_jaar: isHistoric ? parseInt(String(boeking.datum).substring(0, 4)) : null,
    btw_bedrag: 0,
    btw_percentage: 0,
    updated_at: new Date().toISOString()
  };
}

/** Bouwt het databaserecord voor een HNVI-lot. */
function hnviRecord(lot, userId) {
  return {
    user_id: userId,
    legacy_id: String(lot.id),
    datum: lot.datum || null,
    omschrijving: lot.omschr || '',
    inkoop: parseFloat(lot.inkoop) || 0,
    verkoop: lot.verkoop != null ? parseFloat(lot.verkoop) : null,
    status: lot.status || 'voorraad',
    notitie: lot.noot || '',
    updated_at: new Date().toISOString()
  };
}

/** Bouwt het databaserecord voor een voorraadartikel. */
function coverRecord(cover, userId) {
  let ingekocht = 0, verkocht = 0;
  for (const j of Object.values(cover.jaren || {})) {
    ingekocht += (j.inkoop || 0);
    verkocht += (j.verkocht || 0);
  }
  const record = {
    user_id: userId,
    legacy_id: String(cover.id),
    artikel: cover.artikel,
    productgroep_id: null,
    voorraad: cover.voorraad || 0,
    inkoopprijs: cover.inkoopprijs ? parseFloat(cover.inkoopprijs) : null,
    verkoopprijs: cover.prijs ? parseFloat(cover.prijs) : null,
    min_voorraad: cover.minVoorraad || null,
    ingekocht,
    verkocht,
    zoekterm: cover.zoekterm || '',
    updated_at: new Date().toISOString(),
    inkooprekening: String(cover.inkoopGb || '7000'),
    categorie: String(cover.categorie || 'overig'),
    handelsvoorraad: cover.handelsvoorraad !== false,
    jaren: cover.jaren && Object.keys(cover.jaren).length ? cover.jaren : null,
    prijsfactor: Number(cover.prijsFactor) > 0 ? Number(cover.prijsFactor) : 1
  };
  if (coverKolommenOntbreken) OPTIONELE_COVER_KOLOMMEN.forEach(k => delete record[k]);
  return record;
}

/**
 * Stuurt een lijst records in blokken naar een tabel. Per blok wordt eerst de
 * oude versie weggehaald en daarna de nieuwe weggeschreven, zodat een tweede
 * keer versturen geen dubbele regels oplevert.
 */
async function stuurInBlokken(sb, tabel, records, userId, onVoortgang, label) {
  const BLOK = 100;
  let ok = 0, mislukt = 0;

  for (let i = 0; i < records.length; i += BLOK) {
    const blok = records.slice(i, i + BLOK);
    const ids = blok.map(r => r.legacy_id);
    try {
      await sb.from(tabel).delete().eq('user_id', userId).in('legacy_id', ids);
      let { error } = await sb.from(tabel).insert(blok);

      // Ontbreken de nieuwe kolommen nog, dan één keer opnieuw zonder.
      if (error && tabel === 'voorraadartikelen' && !coverKolommenOntbreken && isOnbekendeKolomFout(error)) {
        console.warn('⚠️  Nieuwe kolommen ontbreken; verstuur zonder groep, rekening, jaren en prijsfactor.');
        coverKolommenOntbreken = true;
        blok.forEach(r => OPTIONELE_COVER_KOLOMMEN.forEach(k => delete r[k]));
        ({ error } = await sb.from(tabel).insert(blok));
      }

      if (error) { mislukt += blok.length; console.error(`❌ ${label} blok ${i}:`, error.message); }
      else ok += blok.length;
    } catch (err) {
      mislukt += blok.length;
      console.error(`❌ ${label} blok ${i}:`, err.message);
    }
    onVoortgang?.(label, Math.min(i + BLOK, records.length), records.length);
  }
  return { ok, mislukt };
}

/**
 * Zet alles wat in deze browser staat in één keer in Supabase: boekingen,
 * voorraadartikelen en HNVI-loten. Bedoeld om een nieuw apparaat in te richten
 * of om na een import alles gelijk te trekken.
 */
export async function syncAllesNaarSupabase(data, keuze, onVoortgang) {
  if (!heeftClient()) return { fout: 'Geen verbinding met Supabase.' };

  const sb = await getClient();
  const session = await sb.auth.getSession();
  const userId = session?.data?.session?.user?.id;
  if (!userId) return { fout: 'Niet ingelogd bij Supabase.' };

  const uitkomst = {};

  if (keuze.boekingen) {
    const records = [
      ...(data.HIST_TX || []).map(b => boekingRecord(b, true, userId)),
      ...(data.TX || []).map(b => boekingRecord(b, false, userId))
    ].filter(r => r.datum && Number.isFinite(r.bedrag));
    uitkomst.boekingen = await stuurInBlokken(sb, 'boekingen', records, userId, onVoortgang, 'Boekingen');
  }

  if (keuze.voorraad) {
    const records = (data.COVERS || []).map(c => coverRecord(c, userId));
    uitkomst.voorraad = await stuurInBlokken(sb, 'voorraadartikelen', records, userId, onVoortgang, 'Voorraad');
  }

  if (keuze.hnvi) {
    const records = (data.HNVI_LOTS || []).map(l => hnviRecord(l, userId));
    uitkomst.hnvi = await stuurInBlokken(sb, 'hnvi_loten', records, userId, onVoortgang, 'HNVI-loten');
  }

  return uitkomst;
}

/**
 * Sla HNVI lot op naar Supabase
 * hnvi_loten tabel: id=UUID, legacy_id=app-id, datum/omschrijving/inkoop/verkoop/status/notitie
 */
const OPTIONELE_HNVI_KOLOMMEN = ['factuur', 'verkoopdatum'];
let hnviKolommenOntbreken = false;

export async function saveHnviToSupabase(lot) {
  if (!heeftClient()) {
    console.log('⚠️  Supabase not ready, skipping HNVI save');
    return false;
  }
  
  try {
    const sb = await getClient();
    
    const session = await sb.auth.getSession();
    const userId = session?.data?.session?.user?.id;
    
    if (!userId) {
      console.warn('⚠️  No user ID available for HNVI save');
      return false;
    }
    
    const record = {
      user_id: userId,
      legacy_id: String(lot.id),  // App ID als text in legacy_id
      datum: lot.datum,
      omschrijving: lot.omschr || '',  // NOT NULL - use empty string not null
      inkoop: lot.inkoop ? parseFloat(lot.inkoop) : 0,
      verkoop: lot.verkoop ? parseFloat(lot.verkoop) : null,
      status: lot.status || 'voorraad',
      notitie: lot.noot || '',  // NOT NULL - use empty string not null
      updated_at: new Date().toISOString(),
      // Nieuw sinds de veiling-opzet: factuurnummer en verkoopdatum.
      factuur: lot.factuur || '',
      verkoopdatum: lot.verkoopDatum || null
    };

    if (hnviKolommenOntbreken) {
      OPTIONELE_HNVI_KOLOMMEN.forEach(k => delete record[k]);
    }
    
    // Upsert (delete old, insert new)
    await sb
      .from('hnvi_loten')
      .delete()
      .eq('legacy_id', String(lot.id))
      .eq('user_id', userId);
    
    let { error } = await sb.from('hnvi_loten').insert([record]);

    // Bestaan de nieuwe kolommen nog niet, dan slaan we het lot alsnog op
    // zonder die velden in plaats van de hele synchronisatie te laten klappen.
    if (error && !hnviKolommenOntbreken && isOnbekendeKolomFout(error)) {
      console.warn('⚠️  Kolommen factuur/verkoopdatum ontbreken in hnvi_loten; ALTER TABLE nog niet uitgevoerd?');
      hnviKolommenOntbreken = true;
      OPTIONELE_HNVI_KOLOMMEN.forEach(k => delete record[k]);
      ({ error } = await sb.from('hnvi_loten').insert([record]));
    }
    
    if (error) {
      console.error(`❌ HNVI save failed (${lot.id}):`, error);
      return false;
    }
    
    console.log(`✅ HNVI synced to Supabase: ${lot.id}`);
    return true;
  } catch (err) {
    console.error('Error in saveHnviToSupabase:', err);
    return false;
  }
}

/**
 * Sla Cover (artikel voorraad) op naar Supabase
 * voorraadartikelen tabel: id=UUID, legacy_id=app-id, 
 * productgroep_id=UUID (knoppelink naar groepen, niet in de app beschikbaar)
 */
// Kolommen die pas bestaan na de ALTER TABLE. Ontbreken ze, dan slaan we het
// artikel alsnog op zonder die velden in plaats van de sync te laten klappen.
const OPTIONELE_COVER_KOLOMMEN = ['inkooprekening', 'categorie', 'handelsvoorraad', 'jaren', 'prijsfactor'];
let coverKolommenOntbreken = false;

function isOnbekendeKolomFout(error) {
  const tekst = `${error?.message || ''} ${error?.hint || ''} ${error?.details || ''}`.toLowerCase();
  return error?.code === 'PGRST204' || tekst.includes('could not find') || tekst.includes('column');
}

export async function saveCoverToSupabase(cover) {
  if (!heeftClient()) {
    console.log('⚠️  Supabase not ready, skipping Cover save');
    return false;
  }
  
  try {
    const sb = await getClient();
    
    const session = await sb.auth.getSession();
    const userId = session?.data?.session?.user?.id;
    
    if (!userId) {
      console.warn('⚠️  No user ID available for Cover save');
      return false;
    }
    
    // Bereken ingekocht en verkocht van jaren-data
    let totalIngekocht = 0;
    let totalVerkocht = 0;
    if (cover.jaren) {
      Object.values(cover.jaren).forEach(jaar => {
        totalIngekocht += (jaar.inkoop || 0);
        totalVerkocht += (jaar.verkocht || 0);
      });
    }
    
    const record = {
      user_id: userId,
      legacy_id: String(cover.id),
      artikel: cover.artikel,
      productgroep_id: null,
      voorraad: cover.voorraad || 0,
      inkoopprijs: cover.inkoopprijs ? parseFloat(cover.inkoopprijs) : null,
      verkoopprijs: cover.prijs ? parseFloat(cover.prijs) : null,
      min_voorraad: cover.minVoorraad || null,
      ingekocht: totalIngekocht,
      verkocht: totalVerkocht,
      zoekterm: cover.zoekterm || '',
      updated_at: new Date().toISOString(),
      inkooprekening: String(cover.inkoopGb || '7000'),
      categorie: String(cover.categorie || 'overig'),
      handelsvoorraad: cover.handelsvoorraad !== false,
      jaren: cover.jaren && Object.keys(cover.jaren).length > 0 ? cover.jaren : null,
      prijsfactor: Number(cover.prijsFactor) > 0 ? Number(cover.prijsFactor) : 1
    };
    
    if (coverKolommenOntbreken) {
      OPTIONELE_COVER_KOLOMMEN.forEach(k => delete record[k]);
    }
    
    // Upsert
    await sb
      .from('voorraadartikelen')
      .delete()
      .eq('legacy_id', String(cover.id))
      .eq('user_id', userId);
    
    let { error } = await sb.from('voorraadartikelen').insert([record]);
    if (!error && record.jaren) { console.log(`✅ jaren opgeslagen: ${cover.artikel}`); }
    
    // Ontbreekt een van de nieuwe kolommen, dan één keer opnieuw zonder.
    if (error && !coverKolommenOntbreken && isOnbekendeKolomFout(error)) {
      console.warn('⚠️  Nieuwe kolommen ontbreken in voorraadartikelen; ALTER TABLE nog niet uitgevoerd?');
      console.warn('    Groep, inkooprekening en jaartallen worden nu niet bewaard.');
      coverKolommenOntbreken = true;
      OPTIONELE_COVER_KOLOMMEN.forEach(k => delete record[k]);
      ({ error } = await sb.from('voorraadartikelen').insert([record]));
    }
    
    if (error) {
      console.error(`❌ Cover save failed (${cover.id}):`, error);
      return false;
    }
    
    console.log(`✅ Cover synced to Supabase: ${cover.id}`);
    return true;
  } catch (err) {
    console.error('Error in saveCoverToSupabase:', err);
    return false;
  }
}

// ===== DELETE FROM SUPABASE (SOFT DELETE) =====

/**
 * Delete from appropriate table. 
 * For now: tries to delete from covers first (most common), then HNVI, then boekingen.
 * This is a workaround; in production you'd want to know which table upfront.
 */
export async function deleteFromSupabase(id, type = 'auto') {
  console.log(`🗑️  deleteFromSupabase called: id=${id}, type=${type}`);
  
  if (!heeftClient()) {
    console.warn('⚠️  heeftClient() = false, cannot delete');
    return false;
  }
  
  try {
    const sb = await getClient();
    
    // Haal user ID
    const session = await sb.auth.getSession();
    const userId = session?.data?.session?.user?.id;
    
    if (!userId) {
      console.warn('⚠️  No user ID for delete - session not found');
      return false;
    }
    
    console.log(`✓ User ID found: ${userId.substring(0, 8)}...`);
    
    // Determine which table based on type hint or try all
    let tables = [];
    if (type === 'cover' || type === 'auto') tables.push('voorraadartikelen');
    if (type === 'hnvi' || type === 'auto') tables.push('hnvi_loten');
    if (type === 'boeking' || type === 'auto') tables.push('boekingen');
    
    console.log(`🔄 Trying to delete from tables: ${tables.join(', ')}`);
    
    let lastError = null;
    for (const table of tables) {
      try {
        if (table === 'boekingen') {
          // Soft delete for boekingen
          const { error } = await sb
            .from(table)
            .update({ deleted_at: new Date().toISOString() })
            .eq('legacy_id', String(id))
            .eq('user_id', userId);
          if (!error) {
            console.log(`✅ Deleted from ${table}: ${id}`);
            // Refresh UI na verwijdering van ander apparaat
            setTimeout(() => window.hertekenHuidigePagina?.(), 300);
            return true;
          }
          console.warn(`⚠️  ${table} delete error:`, error?.message || error);
          lastError = error;
        } else {
          // Hard delete for voorraadartikelen and hnvi_loten (use legacy_id)
          const { error } = await sb
            .from(table)
            .delete()
            .eq('legacy_id', String(id))
            .eq('user_id', userId);
          if (!error) {
            console.log(`✅ Deleted from ${table}: ${id}`);
            // Refresh UI na verwijdering van ander apparaat
            setTimeout(() => window.hertekenHuidigePagina?.(), 300);
            return true;
          }
          console.warn(`⚠️  ${table} delete error:`, error?.message || error);
          lastError = error;
        }
      } catch (err) {
        console.error(`❌ Exception deleting from ${table}:`, err);
        lastError = err;
        // Continue to next table
      }
    }
    
    console.error(`❌ Delete failed for ${id}:`, lastError);
    return false;
    
  } catch (err) {
    console.error(`❌ Supabase delete error (${id}):`, err);
    return false;
  }
}

// ===== SYNC PENDING QUEUE =====

export async function syncPendingQueue() {
  if (!heeftClient()) {
    console.log('⚠️  Supabase not available, skipping sync');
    return;
  }
  
  // Verwijderen gaat voor. Staat er zowel een 'create' als een 'delete' voor
  // hetzelfde ding, dan moet het verwijderen als laatste gebeuren — anders
  // maakt de create het meteen weer aan. Sorteren op operatie regelt dat.
  const keys = Object.keys(pendingQueue)
    .sort((a, b) => (pendingQueue[a].operation === 'delete' ? 1 : 0) - (pendingQueue[b].operation === 'delete' ? 1 : 0));
  if (keys.length === 0) return;
  
  console.log(`🔄 Syncing ${keys.length} pending items to Supabase...`);
  
  let synced = 0;
  let failed = 0;
  
  for (const key of keys) {
    const pending = pendingQueue[key];
    
    if (pending.attempts >= pending.maxAttempts) {
      console.warn(`⚠️  ${key}: Max attempts reached, pausing`);
      failed++;
      continue;
    }
    
    pending.attempts++;
    
    try {
      let success = false;
      
      if (pending.operation === 'delete') {
        success = await deleteFromSupabase(pending.id, pending.soort || 'auto');
      } else if (pending.operation === 'hnvi') {
        success = await saveHnviToSupabase(pending.data);
      } else if (pending.operation === 'cover') {
        success = await saveCoverToSupabase(pending.data);
      } else {
        success = await saveToSupabase(pending.data, pending.isHistoric);
      }
      
      if (success) {
        clearPendingQueueItem(key);
        synced++;
      } else {
        pending.status = 'pending';
        failed++;
      }
    } catch (err) {
      console.warn(`❌ Failed to sync ${key}:`, err);
      pending.status = 'pending';
      failed++;
    }
  }
  
  savePendingQueue();
  
  const status = wachtrijStatus();
  if (synced > 0) {
    console.log(`✅ ${synced} verstuurd, ${status.open} nog open`);
  }
  if (status.vastgelopen > 0) {
    console.warn(`⚠️  ${status.vastgelopen} wijziging(en) komen niet aan na ${5} pogingen. ` +
                 `Ze blijven lokaal bewaard; gebruik de synchronisatieknop om opnieuw te proberen.`);
  }
  return { synced, failed, ...status };
}

// ===== HELPERS =====

export function isSupabaseReady() {
  if (!syncIsAangezet()) return false;
  return heeftClient();
}

export function getPendingCount() {
  return Object.keys(pendingQueue).length;
}

export function getPendingItems() {
  return Object.values(pendingQueue);
}
