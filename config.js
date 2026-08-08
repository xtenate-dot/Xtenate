// config.js — verbindingsgegevens van je Supabase-project.
//
// Vul hieronder je eigen waarden in. Je vindt ze in Supabase onder
// Project Settings -> API:
//   Project URL  ->  SUPABASE_URL
//   anon public  ->  SUPABASE_ANON_KEY
//
// De anon key hoort publiek te zijn: hij zegt alleen wie je project is, niet
// wie jij bent. Wat er werkelijk mag, bepaalt Row Level Security in de
// database. Dit bestand mag dus gewoon in je repository staan.
//
// De service_role key staat op dezelfde pagina in Supabase. Die omzeilt Row
// Level Security volledig en hoort NOOIT in de frontend, in een repository of
// in welke code dan ook die je uitlevert. Plak hem hier dus niet.

export const SUPABASE_URL = 'VUL-HIER-JE-PROJECT-URL-IN';
export const SUPABASE_ANON_KEY = 'VUL-HIER-JE-ANON-KEY-IN';

/** Versie van de Supabase-bibliotheek die van de CDN wordt gehaald. */
export const SUPABASE_LIB = 'https://esm.sh/@supabase/supabase-js@2.45.4';

/** Onder welke naam de sessie in de browser wordt bewaard. */
export const SESSIE_SLEUTEL = 'xtenate_auth';

/** Zijn de gegevens hierboven daadwerkelijk ingevuld? */
export function isGeconfigureerd() {
  return !SUPABASE_URL.startsWith('VUL-HIER')
      && !SUPABASE_ANON_KEY.startsWith('VUL-HIER')
      && SUPABASE_URL.startsWith('https://');
}
