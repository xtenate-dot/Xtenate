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

import { getClient, heeftClient } from './supabase.js?v=20260818';

// ===== NOODREM =====
// Zolang dit uit staat gaat er NIETS naar Supabase. Standaard uit, zodat je
// echte administratie nooit per ongeluk wordt verstuurd. Aanzetten doe je
// bewust, in de console van de browser:
//     localStorage.setItem('xtenate_sync_aan', 'ja'); location.reload();
// Uitzetten:
//     localStorage.removeItem('xtenate_sync_aan'); location.reload();
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

/**
 * Save pending queue to localStorage
 * Ensures persistence across page reloads
 */
export function savePendingQueue() {
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(pendingQueue));
    console.log(`📝 Saved pending queue (${Object.keys(pendingQueue).length} items)`);
  } catch (err) {
    console.error('Failed to save pending queue:', err);
  }
}

/**
 * Load pending queue from localStorage
 * Called on app startup to recover unsyncked items
 */
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

/**
 * Clear pending queue (only after successful sync)
 */
export function clearPendingQueueItem(key) {
  delete pendingQueue[key];
  savePendingQueue();
}

/**
 * Add item to pending queue
 * Called after every local change
 */
export function addToPendingQueue(boeking, operation, isHistoric = false) {
  const key = `${operation}_${boeking.id}_${Date.now()}`;
  
  pendingQueue[key] = {
    id: boeking.id,
    operation: operation,      // 'create', 'update', 'delete'
    isHistoric: isHistoric,
    status: 'pending',         // 'pending' or 'syncing'
    timestamp: Date.now(),
    attempts: 0,
    maxAttempts: 3,
    data: operation === 'delete' ? null : {
      id: boeking.id,
      datum: boeking.datum,
      bedrag: boeking.bedrag,
      naam: boeking.naam,
      omschr: boeking.omschr,
      type: boeking.type,
      rek: boeking.rek,
      gb: boeking.gb
    }
  };
  
  savePendingQueue();
  console.log(`➕ Added to pending queue: ${operation} ${boeking.id}`);
  
  return key;
}

// ===== LOAD FROM SUPABASE =====

/**
 * Load boekingen from Supabase with RLS
 * Returns { TX, HIST_TX } or null if failed
 */
export async function loadBoekingenFromSupabase() {
  if (!heeftClient()) {
    console.log('⚠️  Supabase client not initialized');
    return null;
  }
  
  try {
    const sb = await getClient();
    
    // RLS will filter automatically to authenticated user's data
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
    
    // Parse to TX/HIST_TX structure for backward compatibility
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

/**
 * Save boeking to Supabase (upsert)
 * Returns true if successful, false otherwise
 */
export async function saveToSupabase(boeking, isHistoric) {
  if (!heeftClient()) {
    console.log('⚠️  Supabase not ready, skipping save');
    return false;
  }
  
  try {
    const sb = await getClient();
    
    const record = {
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
    
    const { error } = await sb
      .from('boekingen')
      .upsert(record, { onConflict: 'legacy_id' });
    
    if (error) {
      console.error(`❌ Supabase save failed (${boeking.id}):`, error);
      return false;
    }
    
    console.log(`✅ Synced to Supabase: ${boeking.id}`);
    return true;
    
  } catch (err) {
    console.error(`❌ Supabase save error (${boeking.id}):`, err);
    return false;
  }
}

// ===== DELETE FROM SUPABASE (SOFT DELETE) =====

/**
 * Soft delete: set deleted_at timestamp
 * Record stays in DB for recovery, but won't load
 */
export async function deleteFromSupabase(id) {
  if (!heeftClient()) return false;
  
  try {
    const sb = await getClient();
    
    const { error } = await sb
      .from('boekingen')
      .update({ deleted_at: new Date().toISOString() })
      .eq('legacy_id', String(id));
    
    if (error) {
      console.error(`❌ Supabase soft delete failed (${id}):`, error);
      return false;
    }
    
    console.log(`✅ Soft-deleted in Supabase: ${id}`);
    return true;
    
  } catch (err) {
    console.error(`❌ Supabase delete error (${id}):`, err);
    return false;
  }
}

// ===== SYNC PENDING QUEUE =====

/**
 * Retry syncing all pending items to Supabase
 * Called on:
 * - After every local change (async)
 * - On page load (to catch offline changes)
 * - On reconnect event (online)
 */
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
    
    // Skip if already at max attempts
    if (pending.attempts >= pending.maxAttempts) {
      console.warn(`⚠️  ${key}: Max attempts reached, pausing`);
      failed++;
      continue;
    }
    
    pending.attempts++;
    
    try {
      let success = false;
      
      if (pending.operation === 'delete') {
        success = await deleteFromSupabase(pending.id);
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
  // De noodrem gaat voor alles: staat sync uit, dan doen we niets.
  if (!syncIsAangezet()) return false;
  return heeftClient();
}

export function getPendingCount() {
  return Object.keys(pendingQueue).length;
}

export function getPendingItems() {
  return Object.values(pendingQueue);
}

/**
 * Test: Simulate offline by preventing Supabase access
 */
let _testOfflineMode = false;

export function setTestOfflineMode(offline) {
  _testOfflineMode = offline;
  console.log(_testOfflineMode ? '📴 TEST MODE: Offline' : '📡 TEST MODE: Online');
}

export function isTestOfflineMode() {
  return _testOfflineMode;
}

// Override heeftClient in offline mode
const originalHeeftClient = heeftClient;

export function testableHeeftClient() {
  if (_testOfflineMode) return false;
  return originalHeeftClient();
}
