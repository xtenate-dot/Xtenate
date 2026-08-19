// config.js — verbindingsgegevens van je Supabase-project.
//
// Je hebt twee waarden nodig, allebei te vinden in Supabase onder
// Project Settings -> API Keys:
//
//   Project URL      ->  SUPABASE_URL          (tabblad Connect of Settings -> API)
//   Publishable key  ->  SUPABASE_PUBLISHABLE_KEY   (begint met sb_publishable_)
//
// De publishable key hoort publiek te zijn. Hij zegt alleen tegen welk project
// je praat, niet wie jij bent. Wat er werkelijk mag met de gegevens bepaalt
// Row Level Security in de database, en die eist een geldige sessie. Dit
// bestand mag dus gewoon in je repository staan en op GitHub Pages komen.
//
// Op dezelfde pagina staan sleutels die dat NIET zijn:
//   sb_secret_...    (Secret key)
//   service_role     (de oude JWT-variant daarvan)
// Beide omzeilen Row Level Security volledig. Ze horen nooit in de frontend,
// nooit in een repository, en nooit in code die wordt gepubliceerd. Zet ze hier
// dus niet neer — de controle onderaan dit bestand weigert ze ook.

export const SUPABASE_URL = 'https://mgguvduurfsurjomrnkd.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_iDKjeBYhXLG_khglkLqSyA_aFdxJmTj';

/** Versie van de Supabase-bibliotheek die van de CDN wordt gehaald. */
export const SUPABASE_LIB = 'https://esm.sh/@supabase/supabase-js@2.45.4';

/** Onder welke naam de sessie in de browser wordt bewaard. */
export const SESSIE_SLEUTEL = 'xtenate_auth';

/**
 * Herkent een sleutel die geheim hoort te blijven. Zo'n sleutel in de frontend
 * geeft iedere bezoeker volledige toegang tot je administratie, dus daar
 * stoppen we liever met een duidelijke melding dan dat het stilzwijgend werkt.
 */
export function isGeheimeSleutel(sleutel) {
  const waarde = String(sleutel || '');

  // Nieuwe stijl: sb_secret_...
  if (waarde.startsWith('sb_secret_')) return true;

  // Oude stijl: een JWT met "role":"service_role" in het middendeel. Dat deel
  // is base64url, dus eerst omzetten naar gewoon base64 en aanvullen.
  if (waarde.startsWith('eyJ')) {
    const deel = (waarde.split('.')[1] || '').replace(/-/g, '+').replace(/_/g, '/');
    const opgevuld = deel + '='.repeat((4 - (deel.length % 4)) % 4);
    try {
      if (JSON.parse(atob(opgevuld)).role === 'service_role') return true;
    } catch {
      // Lukt decoderen niet, dan zoeken we de tekst rechtstreeks in de sleutel.
      // "service_role" komt er in base64 op drie manieren uit, afhankelijk van
      // waar het woord in de tekenreeks begint. Liever te streng dan een
      // geheime sleutel doorlaten.
      const varianten = ['c2VydmljZV9yb2xl', 'NlcnZpY2Vfcm9sZ', 'zZXJ2aWNlX3JvbG'];
      if (varianten.some(v => waarde.includes(v))) return true;
    }
  }
  return false;
}

/** Zijn de gegevens hierboven ingevuld, en is de sleutel er een die hier mag staan? */
export function isGeconfigureerd() {
  return !SUPABASE_URL.startsWith('VUL-HIER')
      && SUPABASE_URL.startsWith('https://')
      && !SUPABASE_PUBLISHABLE_KEY.startsWith('VUL-HIER')
      && SUPABASE_PUBLISHABLE_KEY.length > 20
      && !isGeheimeSleutel(SUPABASE_PUBLISHABLE_KEY);
}

/** Wat er precies ontbreekt, zodat het opstartscherm het kan uitleggen. */
export function configProbleem() {
  if (isGeheimeSleutel(SUPABASE_PUBLISHABLE_KEY)) {
    return {
      titel: 'Verkeerde sleutel in config.js',
      tekst: 'De ingevulde sleutel is een geheime sleutel. Die geeft volledige toegang tot je administratie en hoort nooit in code die wordt gepubliceerd.',
      herstel: 'Vervang hem door de <strong>Publishable key</strong> (begint met <code>sb_publishable_</code>) uit Project Settings → API Keys. Heb je de geheime sleutel al naar GitHub gepusht, maak hem dan ongeldig in Supabase en maak een nieuwe aan.'
    };
  }
  if (SUPABASE_URL.startsWith('VUL-HIER') || !SUPABASE_URL.startsWith('https://')) {
    return {
      titel: 'Project-URL ontbreekt',
      tekst: 'De project-URL staat nog op zijn standaardwaarde.',
      herstel: 'Open <code>config.js</code> en vul <code>SUPABASE_URL</code> in. Je vindt hem in Supabase onder Project Settings → API, of via de knop Connect bovenaan het dashboard.'
    };
  }
  return {
    titel: 'Publishable key ontbreekt',
    tekst: 'De publishable key staat nog op zijn standaardwaarde.',
    herstel: 'Open <code>config.js</code> en vul <code>SUPABASE_PUBLISHABLE_KEY</code> in. Je vindt hem in Supabase onder Project Settings → API Keys, in het vak Publishable key.'
  };
}
