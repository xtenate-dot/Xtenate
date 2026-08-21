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

import { getClient, heeftClient } from './supabase.js?v=20260821t';

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
  const key = `${operation}_${boeking.id}_${Date.now()}`;

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

  pendingQueue[key] = {
    id: boeking.id,
    operation: operation,
    soort: operation === 'hnvi' ? 'hnvi' : operation === 'cover' ? 'cover' : 'auto',
    isHistoric: isHistoric,
    status: 'pending',
    timestamp: Date.now(),
    attempts: 0,
    maxAttempts: 3,
    data
  };
  
  savePendingQueue();
  console.log(`➕ Added to pending queue: ${operation} ${boeking.id}`);
  
  return key;
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
      datum: lot.datum,
      omschr: lot.omschrijving,
      inkoop: lot.inkoop,
      verkoop: lot.verkoop,
      status: lot.status,
      noot: lot.notitie
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
    
    return data.map(c => ({
      id: parseInt(c.legacy_id) || c.legacy_id,
      artikel: c.artikel,
      categorie: c.productgroep_id || 'overig',  // Fallback
      inkoop: c.inkoopprijs || 0,
      inkoopprijs: c.inkoopprijs || 0,
      voorraad: c.voorraad || 0,
      prijs: c.verkoopprijs || 0,
      omzet2026: 0,  // Dit zit niet in de tabel
      zoekterm: c.zoekterm || '',
      minVoorraad: c.min_voorraad,
      handelsvoorraad: true,  // Default
      inkoopGb: '7000',  // Default
      jaren: {}  // Kan uit Supabase data worden afgeleid via ingekocht/verkocht
    }));
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

/**
 * Sla HNVI lot op naar Supabase
 * hnvi_loten tabel: id=UUID, legacy_id=app-id, datum/omschrijving/inkoop/verkoop/status/notitie
 */
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
      updated_at: new Date().toISOString()
    };
    
    // Upsert (delete old, insert new)
    await sb
      .from('hnvi_loten')
      .delete()
      .eq('legacy_id', String(lot.id))
      .eq('user_id', userId);
    
    const { error } = await sb.from('hnvi_loten').insert([record]);
    
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
      legacy_id: String(cover.id),  // App ID als text in legacy_id
      artikel: cover.artikel,
      productgroep_id: null,  // TODO: moet gekoppeld worden aan groepen-tabel
      voorraad: cover.voorraad || 0,
      inkoopprijs: cover.inkoopprijs ? parseFloat(cover.inkoopprijs) : null,
      verkoopprijs: cover.prijs ? parseFloat(cover.prijs) : null,
      min_voorraad: cover.minVoorraad || null,
      ingekocht: totalIngekocht,
      verkocht: totalVerkocht,
      zoekterm: cover.zoekterm || '',  // NOT NULL - use empty string not null
      updated_at: new Date().toISOString()
    };
    
    // Upsert
    await sb
      .from('voorraadartikelen')
      .delete()
      .eq('legacy_id', String(cover.id))
      .eq('user_id', userId);
    
    const { error } = await sb.from('voorraadartikelen').insert([record]);
    
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
  
  const keys = Object.keys(pendingQueue);
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
  
  if (synced > 0) {
    console.log(`✅ Synced ${synced} items, ${failed} still pending`);
  }
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
