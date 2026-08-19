/**
 * supabase-client.js
 * ==================
 * Supabase client en helpers voor boekingen opslag
 * 
 * Integreert met storage.js:
 * - Laad boekingen van Supabase OF localStorage (fallback)
 * - Opslaan naar Supabase, fallback localStorage
 * - Transparant voor de rest van de app
 */

import { createClient } from '@supabase/supabase-js';

// ===== CONFIGURATIE =====
// Diese values MOETEN in environment/config gedefinieerd zijn
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Status tracking
export const supabaseStatus = {
  initialized: false,
  available: false,
  client: null,
  lastError: null
};

/**
 * Initialiseer Supabase client
 * Kan fail als credentials niet ingesteld zijn (fallback naar localStorage)
 */
export function initSupabaseClient() {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.warn('⚠️  Supabase niet geconfigureerd, fallback naar localStorage');
      supabaseStatus.initialized = true;
      supabaseStatus.available = false;
      return null;
    }
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    supabaseStatus.client = supabase;
    supabaseStatus.initialized = true;
    supabaseStatus.available = true;
    
    console.log('✅ Supabase geïnitialiseerd');
    return supabase;
  } catch (err) {
    console.warn('⚠️  Supabase initialisatie mislukt:', err.message);
    supabaseStatus.initialized = true;
    supabaseStatus.available = false;
    supabaseStatus.lastError = err.message;
    return null;
  }
}

/**
 * Test Supabase verbinding
 */
export async function testSupabaseConnection() {
  if (!supabaseStatus.available || !supabaseStatus.client) {
    return { success: false, reason: 'Supabase not initialized' };
  }
  
  try {
    const { data, error } = await supabaseStatus.client
      .from('boekingen')
      .select('COUNT(*)', { count: 'exact' })
      .limit(1);
    
    if (error) throw error;
    
    return { success: true };
  } catch (err) {
    console.warn('Supabase connection test failed:', err.message);
    return { success: false, reason: err.message };
  }
}

/**
 * Laad boekingen van Supabase
 * Fallback naar localStorage als Supabase niet beschikbaar
 */
export async function loadBoekingenFromSupabase() {
  // Als Supabase niet available is, fallback
  if (!supabaseStatus.available) {
    return null;  // Signal: use localStorage instead
  }
  
  try {
    const { data, error } = await supabaseStatus.client
      .from('boekingen')
      .select('*')
      .is('deleted_at', null)
      .order('datum');
    
    if (error) throw error;
    
    // Parse naar TX/HIST_TX structuur
    return parseSupabaseToState(data);
  } catch (err) {
    console.error('Failed to load from Supabase:', err.message);
    supabaseStatus.lastError = err.message;
    return null;  // Signal fallback
  }
}

/**
 * Transformeer Supabase records terug naar TX/HIST_TX structuur
 */
function parseSupabaseToState(boekingen) {
  const TX = [];
  const HIST_TX = [];
  
  for (const b of boekingen) {
    const stateRecord = {
      id: b.archief_jaar === null ? parseInt(b.legacy_id) : b.legacy_id,  // Restore original ID type
      datum: b.datum,
      bedrag: b.bedrag,
      naam: b.naam,
      omschr: b.omschr,
      type: b.type,
      rek: b.rek,
      gb: b.gb
    };
    
    if (b.archief_jaar === null) {
      TX.push(stateRecord);
    } else {
      HIST_TX.push(stateRecord);
    }
  }
  
  return { TX, HIST_TX };
}

/**
 * Opslaan naar Supabase (upsert)
 * Fallback naar localStorage als Supabase niet beschikbaar
 */
export async function saveToSupabase(boeking, isHistoric) {
  // Als Supabase niet beschikbaar, return false (signal: save locally)
  if (!supabaseStatus.available) {
    return false;
  }
  
  try {
    const supabaseBoeking = {
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
    
    // Upsert (update if exists, insert if new)
    const { error } = await supabaseStatus.client
      .from('boekingen')
      .upsert(supabaseBoeking, { onConflict: 'legacy_id' });
    
    if (error) throw error;
    
    return true;  // Success
  } catch (err) {
    console.error('Supabase save failed:', err.message);
    supabaseStatus.lastError = err.message;
    return false;  // Signal: fallback to localStorage
  }
}

/**
 * Soft delete (mark deleted_at)
 */
export async function deleteFromSupabase(id, isHistoric) {
  if (!supabaseStatus.available) {
    return false;
  }
  
  try {
    const { error } = await supabaseStatus.client
      .from('boekingen')
      .update({ deleted_at: new Date().toISOString() })
      .eq('legacy_id', String(id));
    
    if (error) throw error;
    
    return true;
  } catch (err) {
    console.error('Supabase delete failed:', err.message);
    return false;
  }
}

/**
 * Status indicators
 */
export function isSupabaseReady() {
  return supabaseStatus.available && supabaseStatus.client !== null;
}

export function getSupabaseStatus() {
  return {
    initialized: supabaseStatus.initialized,
    available: supabaseStatus.available,
    error: supabaseStatus.lastError
  };
}

/**
 * Logger (development)
 */
export function logSupabaseStatus() {
  console.log('🔹 Supabase Status:');
  console.log(`   Initialized: ${supabaseStatus.initialized}`);
  console.log(`   Available: ${supabaseStatus.available}`);
  if (supabaseStatus.lastError) {
    console.log(`   Last Error: ${supabaseStatus.lastError}`);
  }
}

// Auto-initialize on module load
initSupabaseClient();
