// opslagdiagnose.js — tijdelijke diagnose. Leest de opslag uit en vergelijkt
// die met de historie in de code. Er wordt NIETS geschreven.
//
// Bewust geen enkele aanroep van setItem, removeItem, clear, save(), of van
// een van de save*Data-functies uit storage.js. Ook `state` wordt niet
// aangepast: de gegevens worden rechtstreeks uit localStorage gelezen, zodat
// je ziet wat er écht staat en niet wat de app er in het geheugen van gemaakt
// heeft. Deze module mag na het onderzoek weer weg.

import { HIST_TX_DEFAULT } from './storage.js?v=20260806a';

const JAREN = ['2022', '2023', '2024', '2025', '2026'];

/** Rauw uit de opslag, zonder tussenkomst van de app. */
function leesRuw(sleutel) {
  const ruw = localStorage.getItem(sleutel);
  if (ruw === null) return { aanwezig: false, tekens: 0, lijst: [], fout: null };
  try {
    const d = JSON.parse(ruw);
    return { aanwezig: true, tekens: ruw.length, lijst: Array.isArray(d) ? d : [], fout: Array.isArray(d) ? null : 'geen lijst' };
  } catch (e) {
    return { aanwezig: true, tekens: ruw.length, lijst: [], fout: 'onleesbaar: ' + e.message };
  }
}

const jaarVan = t => String(t && t.datum || '').slice(0, 4);
const geldigeDatum = t => /^\d{4}-\d{2}-\d{2}$/.test(String(t && t.datum || ''));

/** Het volledige kenmerk: hierop matcht de herstelactie. */
const kenmerk = t => [
  t.datum, Number(t.bedrag).toFixed(2), String(t.gb), String(t.rek), String(t.type),
  String(t.naam || '').trim().toLowerCase(),
  String(t.omschr || '').trim().toLowerCase()
].join('|');

/** Hetzelfde kenmerk zonder de datum: hiermee vinden we verschoven boekingen. */
const kenmerkZonderDatum = t => [
  Number(t.bedrag).toFixed(2), String(t.gb), String(t.rek), String(t.type),
  String(t.naam || '').trim().toLowerCase(),
  String(t.omschr || '').trim().toLowerCase()
].join('|');

/** Grof kenmerk: alleen datum, bedrag en soort. Vangt afwijkingen in de rest. */
const kenmerkGrof = t => [t.datum, Number(t.bedrag).toFixed(2), String(t.type)].join('|');

const dagenTussen = (a, b) =>
  Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000);

const regel = t => [
  t.datum || '(geen datum)',
  Number(t.bedrag).toFixed(2).padStart(9),
  'gb ' + t.gb, 'rek ' + t.rek, t.type,
  JSON.stringify(String(t.naam ?? '')),
  JSON.stringify(String(t.omschr ?? '')),
  'id=' + t.id
].join(' | ');

/** Welke velden verschillen tussen twee boekingen? */
function verschillendeVelden(a, b) {
  const velden = ['datum', 'bedrag', 'gb', 'rek', 'type', 'naam', 'omschr'];
  return velden.filter(v => {
    if (v === 'bedrag') return Number(a.bedrag).toFixed(2) !== Number(b.bedrag).toFixed(2);
    if (v === 'naam' || v === 'omschr') {
      return String(a[v] || '').trim().toLowerCase() !== String(b[v] || '').trim().toLowerCase();
    }
    return String(a[v] ?? '') !== String(b[v] ?? '');
  });
}

/**
 * Vergelijkt één jaar in drie ronden, van streng naar soepel, zodat elke
 * boeking in precies één categorie terechtkomt.
 */
function vergelijkJaar(jaar, vanMij, vanCode) {
  const exact = [];
  const verschoven = [];   // zelfde boeking, alleen de datum wijkt af
  const afwijkend = [];    // zelfde datum en bedrag, een ander veld wijkt af
  const mijnOver = [];
  const codeOver = [];

  const groepeer = (lijst, sleutelVan) => {
    const m = new Map();
    lijst.forEach(t => {
      const k = sleutelVan(t);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(t);
    });
    return m;
  };
  const opDatum = (a, b) => String(a.datum).localeCompare(String(b.datum));

  // Ronde 1 — alles gelijk behalve mogelijk de datum.
  //
  // Binnen zo'n groep worden beide kanten op datum gesorteerd en van voor naar
  // achter naast elkaar gelegd. Dat is nodig omdat dezelfde boeking vaak in
  // reeksen voorkomt: vijftien keer PostNL van 6,75 in één jaar. Zou ik per
  // boeking de dichtstbijzijnde partner zoeken, dan pakt de een de partner van
  // de ander en ontstaan er verschuivingen van drie of vier dagen die er niet
  // zijn. Op volgorde koppelen houdt de reeks intact.
  const DREMPEL_DAGEN = 31;
  const mijnGroepen = groepeer(vanMij, kenmerkZonderDatum);
  const codeGroepen = groepeer(vanCode, kenmerkZonderDatum);

  new Set([...mijnGroepen.keys(), ...codeGroepen.keys()]).forEach(k => {
    const a = (mijnGroepen.get(k) || []).slice().sort(opDatum);
    const b = (codeGroepen.get(k) || []).slice().sort(opDatum);
    let i = 0, j = 0;
    while (i < a.length && j < b.length) {
      if (!geldigeDatum(a[i])) { mijnOver.push(a[i]); i++; continue; }
      const dagen = dagenTussen(a[i].datum, b[j].datum);
      if (Math.abs(dagen) <= DREMPEL_DAGEN) {
        if (dagen === 0) exact.push({ mijn: a[i], code: b[j] });
        else verschoven.push({ mijn: a[i], code: b[j], dagen });
        i++; j++;
      } else if (dagen < 0) {
        mijnOver.push(a[i]); i++;      // deze van mij heeft geen tegenhanger
      } else {
        codeOver.push(b[j]); j++;      // deze uit de code ontbreekt bij mij
      }
    }
    while (i < a.length) mijnOver.push(a[i++]);
    while (j < b.length) codeOver.push(b[j++]);
  });

  // Ronde 2 — zelfde datum, bedrag en soort, maar een ander veld wijkt af.
  const codeRest = groepeer(codeOver, kenmerkGrof);
  for (let i = mijnOver.length - 1; i >= 0; i--) {
    const bak = codeRest.get(kenmerkGrof(mijnOver[i]));
    if (!bak || !bak.length) continue;
    const partner = bak.pop();
    afwijkend.push({ mijn: mijnOver[i], code: partner, velden: verschillendeVelden(mijnOver[i], partner) });
    codeOver.splice(codeOver.indexOf(partner), 1);
    mijnOver.splice(i, 1);
  }

  const sorteer = l => l.slice().sort((x, y) => opDatum(x.mijn || x, y.mijn || y));

  // Echte dubbelen binnen mijn eigen gegevens: volledig identieke regels.
  const telling = new Map();
  vanMij.forEach(t => telling.set(kenmerk(t), (telling.get(kenmerk(t)) || 0) + 1));
  const dubbelen = [...telling.entries()].filter(([, n]) => n > 1)
    .map(([k, n]) => ({ aantal: n, kenmerk: k, voorbeeld: vanMij.find(t => kenmerk(t) === k) }));

  return {
    jaar,
    aantalMijn: vanMij.length,
    aantalCode: vanCode.length,
    exact: sorteer(exact),
    verschoven: sorteer(verschoven),
    afwijkend: sorteer(afwijkend),
    alleenBijMij: mijnOver.slice().sort(opDatum),
    alleenInCode: codeOver.slice().sort(opDatum),
    dubbelen
  };
}

/**
 * De volledige diagnose. Leest, rekent, en geeft alles terug. Schrijft niets.
 */
export function opslagDiagnose() {
  const tx = leesRuw('xtenate_tx');
  const hist = leesRuw('xtenate_hist_tx_override');
  const alleVanMij = [...hist.lijst, ...tx.lijst];

  const perJaar = lijst => {
    const u = {};
    lijst.forEach(t => { const j = jaarVan(t) || 'GEEN DATUM'; u[j] = (u[j] || 0) + 1; });
    return u;
  };

  // Datamodel: welk type heeft elk veld, in elke bak?
  const vingerafdruk = lijst => {
    const velden = {};
    lijst.forEach(t => Object.entries(t || {}).forEach(([k, v]) => {
      const soort = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
      velden[k] = velden[k] || {};
      velden[k][soort] = (velden[k][soort] || 0) + 1;
    }));
    return velden;
  };

  // Per jaar vergelijken. 2026 staat niet in de codehistorie; die kant is leeg.
  const jaren = JAREN.map(jaar => vergelijkJaar(
    jaar,
    alleVanMij.filter(t => jaarVan(t) === jaar),
    HIST_TX_DEFAULT.filter(t => jaarVan(t) === jaar)
  ));

  // Boekingen zonder bruikbare datum.
  const zonderDatum = alleVanMij.filter(t => !geldigeDatum(t));

  // Dubbele nummers. De dry-run kijkt naar t.id, niet naar de inhoud, dus een
  // botsing kan ook twee totaal verschillende boekingen betreffen.
  const perId = new Map();
  alleVanMij.forEach(t => {
    const k = String(t && t.id);
    if (!perId.has(k)) perId.set(k, []);
    perId.get(k).push(t);
  });
  const idBotsingen = [...perId.entries()]
    .filter(([, v]) => v.length > 1)
    .map(([id, v]) => ({
      id,
      aantal: v.length,
      zelfdeInhoud: new Set(v.map(kenmerk)).size === 1,
      regels: v
    }))
    .sort((a, b) => b.aantal - a.aantal || String(a.id).localeCompare(String(b.id)));

  return {
    moment: new Date().toLocaleString('nl-NL'),
    tijdzone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    utcAfwijkingUren: -new Date().getTimezoneOffset() / 60,
    bakken: {
      xtenate_tx: { ...tx, lijst: undefined, aantal: tx.lijst.length, perJaar: perJaar(tx.lijst), velden: vingerafdruk(tx.lijst) },
      xtenate_hist_tx_override: { ...hist, lijst: undefined, aantal: hist.lijst.length, perJaar: perJaar(hist.lijst), velden: vingerafdruk(hist.lijst) },
      HIST_TX_DEFAULT: { aantal: HIST_TX_DEFAULT.length, perJaar: perJaar(HIST_TX_DEFAULT), velden: vingerafdruk(HIST_TX_DEFAULT) }
    },
    jaren,
    zonderDatum,
    idBotsingen,
    tweeentwintigVolledig: alleVanMij.filter(t => jaarVan(t) === '2022')
      .slice().sort((a, b) => String(a.datum).localeCompare(String(b.datum)))
  };
}

/** Alles als platte tekst, om hier terug te plakken. */
export function opslagDiagnoseAlsTekst(d) {
  const r = [];
  const p = (...a) => r.push(a.join(' '));

  p('DIAGNOSE OPSLAG XTENATE — ALLEEN LEZEN —', d.moment);
  p('tijdzone:', d.tijdzone, '| UTC-afwijking:', d.utcAfwijkingUren, 'uur');
  p('Er is niets geschreven, hersteld of gemigreerd.');
  p('');

  p('=== 1. DE DRIE BRONNEN ===');
  Object.entries(d.bakken).forEach(([naam, b]) => {
    p(naam + ':', b.aantal, 'boekingen'
      + (b.aanwezig === false ? '  (sleutel bestaat niet)' : '')
      + (b.fout ? '  LET OP: ' + b.fout : '')
      + (b.tekens ? '  (' + b.tekens + ' tekens)' : ''));
    p('   per jaar:', JSON.stringify(b.perJaar));
    p('   velden  :', Object.entries(b.velden).sort()
      .map(([k, s]) => k + '=' + Object.entries(s).map(([a, n]) => a + '×' + n).join('/')).join('  '));
  });
  p('');

  p('=== 2. VERGELIJKING PER JAAR ===');
  p('jaar | bij mij | in code | exact gelijk | zelfde boeking, datum verschoven | zelfde datum, ander veld | alleen bij mij | alleen in code');
  d.jaren.forEach(j => p(
    [j.jaar, j.aantalMijn, j.aantalCode, j.exact.length, j.verschoven.length,
     j.afwijkend.length, j.alleenBijMij.length, j.alleenInCode.length]
      .map((v, i) => String(v).padStart(i === 0 ? 4 : 8)).join(' |')));
  p('');

  p('=== 3. DATUMVERSCHUIVINGEN ===');
  d.jaren.forEach(j => {
    if (!j.verschoven.length) return;
    const perDelta = {};
    j.verschoven.forEach(v => { perDelta[v.dagen] = (perDelta[v.dagen] || 0) + 1; });
    p(j.jaar + ':', Object.entries(perDelta).sort((a, b) => a[0] - b[0])
      .map(([dagen, n]) => `${n}× ${dagen > 0 ? '+' : ''}${dagen} dag`).join(', '));
    j.verschoven.slice(0, 15).forEach(v =>
      p('   bij mij', v.mijn.datum, '<-> code', v.code.datum,
        `(${v.dagen > 0 ? '+' : ''}${v.dagen})`, '|', Number(v.mijn.bedrag).toFixed(2),
        '|', JSON.stringify(String(v.mijn.naam || '').slice(0, 40))));
    if (j.verschoven.length > 15) p('   … en nog', j.verschoven.length - 15);
  });
  p('');

  p('=== 4. ZELFDE DATUM MAAR EEN ANDER VELD ===');
  let afw = 0;
  d.jaren.forEach(j => j.afwijkend.forEach(a => {
    afw++;
    p(j.jaar, '| verschilt op:', a.velden.join(', '));
    p('   bij mij :', regel(a.mijn));
    p('   in code :', regel(a.code));
  }));
  if (!afw) p('geen');
  p('');

  p('=== 5. ALLEEN BIJ MIJ (echt nieuw) ===');
  d.jaren.forEach(j => {
    if (!j.alleenBijMij.length) return;
    p(j.jaar + ':', j.alleenBijMij.length);
    j.alleenBijMij.forEach(t => p('   ' + regel(t)));
  });
  p('');

  p('=== 6. ALLEEN IN DE CODE (ontbreekt bij mij) ===');
  d.jaren.forEach(j => {
    if (!j.alleenInCode.length) return;
    p(j.jaar + ':', j.alleenInCode.length);
    j.alleenInCode.slice(0, 40).forEach(t => p('   ' + regel(t)));
    if (j.alleenInCode.length > 40) p('   … en nog', j.alleenInCode.length - 40);
  });
  p('');

  p('=== 7. ECHTE DUBBELE BOEKINGEN (identiek, in mijn eigen opslag) ===');
  let dub = 0;
  d.jaren.forEach(j => j.dubbelen.forEach(x => { dub++; p(j.jaar, '|', x.aantal + '×', '|', regel(x.voorbeeld)); }));
  if (!dub) p('geen');
  p('(dit kunnen legitieme dubbele boekingen zijn: twee pakketten op één dag)');
  p('');

  p('=== 8. BOEKINGEN ZONDER GELDIGE DATUM:', d.zonderDatum.length, '===');
  d.zonderDatum.forEach(t => p('   ' + JSON.stringify(t)));
  p('');

  p('=== 9. DUBBELE NUMMERS (id):', d.idBotsingen.length, 'nummers,',
    d.idBotsingen.reduce((s, x) => s + x.aantal - 1, 0), 'regels te veel ===');
  p('(de dry-run vergelijkt alleen t.id, niet de inhoud)');
  d.idBotsingen.forEach(x => {
    p('   id', x.id, '—', x.aantal + '×', '—',
      x.zelfdeInhoud ? 'ZELFDE INHOUD (echte dubbele boeking)' : 'VERSCHILLENDE INHOUD (alleen nummerbotsing)');
    x.regels.forEach(t => p('      ' + regel(t)));
  });
  p('');

  p('=== 10. ALLE', d.tweeentwintigVolledig.length, 'BOEKINGEN VAN 2022 IN MIJN OPSLAG ===');
  d.tweeentwintigVolledig.forEach(t => p('   ' + regel(t)));

  return r.join('\n');
}
