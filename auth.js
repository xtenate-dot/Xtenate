// auth.js — inloggen, uitloggen en het afschermen van de app.
//
// Let op wat dit wel en niet is. Het inlogscherm houdt de administratie uit
// beeld tot je bent ingelogd. Zolang de gegevens nog in deze browser staan,
// is dat een deur en geen kluis: wie de opslag van de browser openmaakt, komt
// er nog steeds bij. Echte afscherming ontstaat pas wanneer de gegevens in
// Supabase staan en Row Level Security ze bewaakt.

import { getClient, leesbareFout, testVerbinding } from './supabase.js?v=20260812c';
import { configProbleem, isGeconfigureerd } from './config.js?v=20260812c';

const el = id => document.getElementById(id);

let sessie = null;
let startApp = null;
let appGestart = false;

export function huidigeSessie() { return sessie; }
export function huidigeGebruiker() { return sessie?.user || null; }

// ------------------------------------------------------------------ schermen

function toonScherm(welke) {
  document.body.classList.toggle('niet-ingelogd', welke !== 'app');
  el('auth-scherm').style.display = welke === 'app' ? 'none' : 'flex';
  el('auth-inloggen').style.display = welke === 'inloggen' ? '' : 'none';
  el('auth-probleem').style.display = welke === 'probleem' ? '' : 'none';
  el('auth-bezig').style.display = welke === 'bezig' ? '' : 'none';
}

function toonFout(melding) {
  const vak = el('auth-fout');
  vak.textContent = melding || '';
  vak.style.display = melding ? '' : 'none';
}

function toonProbleem(titel, melding, hersteltekst) {
  el('auth-probleem-titel').textContent = titel;
  el('auth-probleem-tekst').textContent = melding;
  el('auth-probleem-herstel').innerHTML = hersteltekst || '';
  toonScherm('probleem');
}

function bezig(aan, knoptekst) {
  const knop = el('auth-knop');
  knop.disabled = aan;
  knop.textContent = aan ? (knoptekst || 'Bezig…') : 'Inloggen';
}

// ------------------------------------------------------------------ acties

export async function login(event) {
  if (event?.preventDefault) event.preventDefault();
  const email = el('auth-email').value.trim();
  const wachtwoord = el('auth-wachtwoord').value;

  if (!email || !wachtwoord) {
    toonFout('Vul je e-mailadres en wachtwoord in.');
    (email ? el('auth-wachtwoord') : el('auth-email')).focus();
    return;
  }

  toonFout('');
  bezig(true, 'Inloggen…');
  try {
    const sb = await getClient();
    const { data, error } = await sb.auth.signInWithPassword({ email, password: wachtwoord });
    if (error) throw error;
    sessie = data.session;
    el('auth-wachtwoord').value = '';
    naarApp();
  } catch (e) {
    toonFout(leesbareFout(e));
    el('auth-wachtwoord').select();
  } finally {
    bezig(false);
  }
}

export async function uitloggen() {
  if (!window.confirm('Uitloggen? Je gegevens blijven gewoon staan.')) return;
  try {
    const sb = await getClient();
    await sb.auth.signOut();
  } catch (e) {
    console.warn('Uitloggen bij Supabase mislukte, sessie lokaal opgeruimd:', e);
  }
  sessie = null;
  toonAccount();
  el('auth-email').value = '';
  el('auth-wachtwoord').value = '';
  toonFout('');
  toonScherm('inloggen');
}

/** Opnieuw proberen na een verbindingsprobleem. */
export function opnieuwVerbinden() { start(startApp); }

// ------------------------------------------------------------------ opstart

function toonAccount() {
  const gebruiker = huidigeGebruiker();
  const vak = el('account-blok');
  if (!vak) return;
  vak.style.display = gebruiker ? '' : 'none';
  if (gebruiker) el('account-email').textContent = gebruiker.email || 'ingelogd';
}

function naarApp() {
  toonAccount();
  toonScherm('app');
  // De app zelf wordt maar één keer opgestart; opnieuw inloggen tekent alleen
  // de huidige pagina opnieuw.
  if (!appGestart) { appGestart = true; startApp?.(); }
  else window.hertekenHuidigePagina?.();
}

/**
 * Bepaalt bij het openen van de app of er al een geldige sessie is.
 * `bijInloggen` wordt aangeroepen zodra dat het geval is.
 */
export async function start(bijInloggen) {
  startApp = bijInloggen || startApp;
  toonScherm('bezig');

  if (!isGeconfigureerd()) {
    const probleem = configProbleem();
    toonProbleem(probleem.titel, probleem.tekst, probleem.herstel);
    return;
  }

  try {
    await testVerbinding();
  } catch (e) {
    toonProbleem('Geen verbinding met Supabase', leesbareFout(e),
      'Controleer je internetverbinding en de gegevens in <code>config.js</code>.');
    return;
  }

  const sb = await getClient();
  const { data } = await sb.auth.getSession();
  sessie = data.session || null;

  // Supabase houdt de sessie zelf bij: verlopen, vernieuwd, of uitgelogd op
  // een ander tabblad. Daar luisteren we naar in plaats van het zelf te regelen.
  sb.auth.onAuthStateChange((gebeurtenis, nieuweSessie) => {
    sessie = nieuweSessie;
    if (!nieuweSessie && gebeurtenis !== 'INITIAL_SESSION') {
      toonAccount();
      toonScherm('inloggen');
    }
  });

  if (sessie) naarApp();
  else { toonScherm('inloggen'); el('auth-email').focus(); }
}
