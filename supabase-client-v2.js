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

import { getClient, heeftClient } from './supabase.js?v=20260821e';

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
  
  pendingQueue[key] = {
    id: boeking.id,
    operation: operation,
    isHistoric: isHistoric,
    status: 'pending',
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
    console.error(`❌ Supabase save error (${boeking.id}):`, err);
    return false;
  }
}

// ===== DELETE FROM SUPABASE (SOFT DELETE) =====

export async function deleteFromSupabase(id) {
  if (!heeftClient()) return false;
  
  try {
    const sb = await getClient();
    
    // Haal user ID
    const session = await sb.auth.getSession();
    const userId = session?.data?.session?.user?.id;
    
    if (!userId) {
      console.warn('⚠️  No user ID for delete');
      return false;
    }
    
    const { error } = await sb
      .from('boekingen')
      .update({ deleted_at: new Date().toISOString() })
      .eq('legacy_id', String(id))
      .eq('user_id', userId);
    
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
  if (!syncIsAangezet()) return false;
  return heeftClient();
}

export function getPendingCount() {
  return Object.keys(pendingQueue).length;
}

export function getPendingItems() {
  return Object.values(pendingQueue);
}
