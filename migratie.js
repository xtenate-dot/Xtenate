// migratie.js — de overstap van lokale opslag naar Supabase.
//
// Dit bestand bouwt het migratieplan en voert de proefmigratie uit. Er wordt in
// deze fase niets naar Supabase geschreven: `bouwPlan` leest alleen, en
// `dryRun` vergelijkt dat plan met wat er nu in de database staat.
//
// De bron van waarheid is en blijft de lokale administratie. Er wordt nergens
// iets uit localStorage verwijderd of overschreven.

import {
  BEGINSALDO_2026, GBNM, REKNM, calcIB, isInkomst, isOmzet, isUitgave, teltBij
} from './helpers.js?v=20260806a';
import { HOME_TOTALS, MAAND_SALDOS, state } from './storage.js?v=20260806a';
import { verborgenOverzicht } from './negeren.js?v=20260806a';
import { getClient, leesbareFout } from './supabase.js?v=20260806a';

const HOOFDREKENING = '1010';

/** Alle boekingen, met het jaar er los bij. */
function alleBoekingen() {
  return [...state.HIST_TX, ...state.TX].map(t => ({ ...t, jaar: String(t.datum || '').slice(0, 4) }));
}

// ------------------------------------------------------------------ het plan

/**
 * Zet de hele lokale administratie om in een plan: wat zou er per tabel naar
 * Supabase gaan. Leest uitsluitend; verandert niets.
 */
export function bouwPlan() {
  const boekingen = alleBoekingen();

  const jaren = [...new Set(boekingen.map(t => t.jaar).filter(Boolean))].sort();
  const perJaar = jaren.map(jaar => ({
    jaar,
    aantal: boekingen.filter(t => t.jaar === jaar).length
  }));

  // Grootboeknummers die in de boekingen voorkomen
  const gebruikteNummers = [...new Set(boekingen.map(t => t.gb).filter(Boolean))].sort();
  const ontbrekendeNummers = gebruikteNummers.filter(nr => !GBNM[nr]);

  // Bankrekeningen die in de boekingen voorkomen
  const gebruikteRekeningen = [...new Set(boekingen.map(t => t.rek).filter(Boolean))].sort();
  const ontbrekendeRekeningen = gebruikteRekeningen.filter(nr => !REKNM[nr]);

  const maandsaldi = Object.entries(MAAND_SALDOS)
    .filter(([, v]) => v && (v.begin != null || v.eind != null))
    .map(([maand, v]) => ({ maand, ...v }));

  const jaartotalen = Object.entries(HOME_TOTALS).map(([jaar, v]) => ({ jaar, ...v }));

  const voorraadstanden = [];
  state.COVERS.forEach(c => {
    Object.entries(c.jaren || {}).forEach(([jaar, v]) => {
      if (v.eind == null && v.verkocht == null) return;
      voorraadstanden.push({ artikel: c.artikel, jaar, ...v });
    });
  });

  const verborgen = verborgenOverzicht();

  return {
    boekingen,
    jaren,
    perJaar,
    gebruikteNummers,
    ontbrekendeNummers,
    gebruikteRekeningen,
    ontbrekendeRekeningen,
    maandsaldi,
    jaartotalen,
    productgroepen: state.GROEPEN,
    artikelen: state.COVERS,
    voorraadstanden,
    // Eén beginstandregel per artikel, zoals afgesproken.
    voorraadmutaties: state.COVERS.map(c => ({ artikel: c.artikel, aantal: Number(c.voorraad) || 0 })),
    loten: state.HNVI_LOTS,
    genegeerdeMeldingen: verborgen.meldingen,
    uitgezetteControles: verborgen.controles
  };
}

// --------------------------------------------------------- financiële totalen

/** De cijfers waarop je na de migratie wilt kunnen controleren. */
export function financieleTotalen(plan) {
  const perJaar = plan.jaren.map(jaar => {
    const vanJaar = plan.boekingen.filter(t => t.jaar === jaar);
    const uitExcel = HOME_TOTALS[jaar];

    // Uit de losse boekingen opgeteld
    const omzet = vanJaar.filter(t => isInkomst(t) && isOmzet(t.gb)).reduce((s, t) => s + t.bedrag, 0);
    const kosten = vanJaar.filter(isUitgave).reduce((s, t) => s + t.bedrag, 0);
    const priveOp = vanJaar.filter(t => t.type === 'prive_opname').reduce((s, t) => s + t.bedrag, 0);
    const priveSt = vanJaar.filter(t => t.type === 'prive_storting').reduce((s, t) => s + t.bedrag, 0);

    // De jaartotalen uit "Per Periode" zijn leidend op Home; die nemen we
    // apart mee, zodat een verschil zichtbaar wordt in plaats van verstopt.
    const winst = (uitExcel ? uitExcel.omzet - uitExcel.kosten : omzet - kosten);

    return {
      jaar,
      aantal: vanJaar.length,
      omzet: afronden(omzet),
      kosten: afronden(kosten),
      priveOp: afronden(priveOp),
      priveSt: afronden(priveSt),
      excelOmzet: uitExcel ? afronden(uitExcel.omzet) : null,
      excelKosten: uitExcel ? afronden(uitExcel.kosten) : null,
      excelPriveOp: uitExcel ? afronden(uitExcel.priveOp) : null,
      excelPriveSt: uitExcel ? afronden(uitExcel.priveSt) : null,
      winst: afronden(winst),
      ib: Math.round(calcIB(winst))
    };
  });

  const banksaldo = BEGINSALDO_2026 + state.TX
    .filter(t => t.rek === HOOFDREKENING)
    .reduce((s, t) => s + (teltBij(t) ? t.bedrag : -t.bedrag), 0);

  const inVoorraad = state.HNVI_LOTS.filter(l => l.status === 'voorraad');
  const voorraadwaardeArtikelen = state.COVERS.reduce((s, c) =>
    s + (c.inkoopprijs != null && c.inkoopprijs !== '' ? Number(c.voorraad) * Number(c.inkoopprijs) : 0), 0);

  return {
    perJaar,
    banksaldo: afronden(banksaldo),
    voorraadwaardeArtikelen: afronden(voorraadwaardeArtikelen),
    artikelenZonderKostprijs: state.COVERS.filter(c => c.inkoopprijs == null || c.inkoopprijs === '').length,
    voorraadStuks: state.COVERS.reduce((s, c) => s + (Number(c.voorraad) || 0), 0),
    hnviVoorraadwaarde: afronden(inVoorraad.reduce((s, l) => s + (Number(l.inkoop) || 0), 0)),
    hnviInVoorraad: inVoorraad.length
  };
}

const afronden = n => Math.round(n * 100) / 100;

// ------------------------------------------------------------- waarschuwingen

/**
 * Zoekt vooraf naar regels die de database zou weigeren. Beter nu weten dan
 * halverwege de migratie stuklopen.
 */
export function controleerPlan(plan, stam = null) {
  const punten = [];
  const voegToe = (ernst, titel, aantal, uitleg, voorbeelden = []) =>
    punten.push({ ernst, titel, aantal, uitleg, voorbeelden: voorbeelden.slice(0, 5) });

  const zonderDatum = plan.boekingen.filter(t => !/^\d{4}-\d{2}-\d{2}$/.test(t.datum || ''));
  if (zonderDatum.length) {
    voegToe('fout', 'Boekingen zonder geldige datum', zonderDatum.length,
      'De kolom datum mag niet leeg zijn. Deze regels zouden de migratie laten mislukken.',
      zonderDatum.map(t => `${t.naam || '(geen naam)'} · ${t.bedrag}`));
  }

  const negatief = plan.boekingen.filter(t => Number(t.bedrag) < 0);
  if (negatief.length) {
    voegToe('fout', 'Boekingen met een negatief bedrag', negatief.length,
      'De database weigert negatieve bedragen; de richting volgt uit de soort mutatie.',
      negatief.map(t => `${t.datum} · ${t.naam} · ${t.bedrag}`));
  }

  const nul = plan.boekingen.filter(t => Number(t.bedrag) === 0);
  if (nul.length) {
    voegToe('let op', 'Boekingen met een bedrag van nul', nul.length,
      'Deze gaan gewoon mee — de database laat ze toe zodat de controlepagina ze kan blijven melden.',
      nul.map(t => `${t.datum} · ${t.naam || '(geen naam)'}`));
  }

  const nieuweNummers = plan.nieuweNummers ?? plan.ontbrekendeNummers;
  if (nieuweNummers.length) {
    voegToe('let op', 'Grootboeknummers die nog niet in de database staan', nieuweNummers.length,
      'Deze worden tijdens de migratie aangemaakt met de omschrijving "Nog te classificeren", zodat geen enkele boeking zijn nummer verliest.',
      nieuweNummers);
  }

  const nieuweRekeningen = plan.nieuweRekeningen ?? plan.ontbrekendeRekeningen;
  if (nieuweRekeningen.length) {
    voegToe('fout', 'Bankrekeningen die nog niet in de database staan', nieuweRekeningen.length,
      'Elke boeking moet aan een bankrekening hangen. Maak deze eerst aan.',
      nieuweRekeningen);
  }

  const ids = new Map();
  const dubbel = [];
  plan.boekingen.forEach(t => {
    const sleutel = String(t.id);
    if (ids.has(sleutel)) dubbel.push(sleutel); else ids.set(sleutel, t);
  });
  if (dubbel.length) {
    voegToe('fout', 'Boekingen met een dubbel nummer', dubbel.length,
      'Het oude nummer wordt als legacy_id bewaard en moet uniek zijn. Los deze eerst op via de controlepagina.',
      [...new Set(dubbel)]);
  }

  const naamloos = plan.artikelen.filter(c => !String(c.artikel || '').trim());
  if (naamloos.length) {
    voegToe('fout', 'Voorraadartikelen zonder naam', naamloos.length,
      'Een artikel moet een naam hebben.');
  }

  const koppelbaar = plan.genegeerdeMeldingen.filter(m =>
    ids.has(String(m.itemSleutel)) || plan.artikelen.some(c => String(c.id) === String(m.itemSleutel)));
  const nietKoppelbaar = plan.genegeerdeMeldingen.length - koppelbaar.length;
  if (nietKoppelbaar > 0) {
    voegToe('let op', 'Genegeerde meldingen zonder herkenbaar doel', nietKoppelbaar,
      'Deze verwijzen naar een grootboeknummer of naar iets dat inmiddels is verwijderd. Ze gaan mee op hun oude sleutel en blijven werken.');
  }

  return punten;
}

/**
 * Zet de uitkomst om in platte tekst, zodat je hem in één keer kunt kopiëren
 * en doorsturen. Bewust zonder opmaak: dan blijft hij overal leesbaar.
 */
export function alsTekst({ plan, totalen, waarschuwingen, regels, inDatabase }) {
  const r = [];
  const bedrag = n => Number(n || 0).toFixed(2).padStart(12);

  r.push('DRY-RUN XTENATE ADMINISTRATIE — ' + new Date().toLocaleString('nl-NL'));
  r.push('');
  r.push('WAT ER ZOU WORDEN OVERGEZET');
  r.push('Onderdeel'.padEnd(22) + 'Erbij'.padStart(7) + '  Nu in DB  Toelichting');
  regels.forEach(x => r.push(
    x.tabel.padEnd(22) + String(x.toevoegen).padStart(7) +
    String(inDatabase?.[x.tabel] ?? '-').padStart(10) + '  ' + x.toelichting));

  r.push('');
  r.push('BOEKINGEN PER JAAR');
  plan.perJaar.forEach(j => r.push(`  ${j.jaar}: ${j.aantal}`));
  r.push(`  totaal: ${plan.boekingen.length}`);

  r.push('');
  r.push('FINANCIELE TOTALEN PER JAAR');
  r.push('Jaar  Boekingen        Omzet       Kosten     Prive op     Prive st  Gesch. IB');
  totalen.perJaar.forEach(j => r.push(
    j.jaar.padEnd(6) + String(j.aantal).padStart(9) +
    bedrag(j.excelOmzet ?? j.omzet) + bedrag(j.excelKosten ?? j.kosten) +
    bedrag(j.excelPriveOp ?? j.priveOp) + bedrag(j.excelPriveSt ?? j.priveSt) +
    String(j.ib).padStart(11)));

  r.push('');
  r.push('VOORRAAD EN SALDO');
  r.push('  Banksaldo                : ' + totalen.banksaldo.toFixed(2));
  r.push('  Voorraadwaarde artikelen : ' + totalen.voorraadwaardeArtikelen.toFixed(2) +
    ` (${totalen.artikelenZonderKostprijs} zonder kostprijs)`);
  r.push('  Stuks op voorraad        : ' + totalen.voorraadStuks);
  r.push('  HNVI in voorraad         : ' + totalen.hnviVoorraadwaarde.toFixed(2) +
    ` (${totalen.hnviInVoorraad} loten)`);

  r.push('');
  r.push('STAMGEGEVENS');
  r.push('  Grootboeknummers in gebruik : ' + plan.gebruikteNummers.length +
    ', nieuw aan te maken: ' + (plan.nieuweNummers?.length ?? '?'));
  r.push('  Bankrekeningen in gebruik   : ' + plan.gebruikteRekeningen.join(', ') +
    ', nieuw: ' + (plan.nieuweRekeningen?.length ?? '?'));
  r.push('  Productgroepen              : ' + plan.productgroepen.map(g => g.naam).join(', '));
  r.push('  Nieuwe productgroepen       : ' + (plan.nieuweGroepen?.length ?? '?'));

  r.push('');
  r.push('AANDACHTSPUNTEN');
  if (!waarschuwingen.length) r.push('  geen');
  waarschuwingen.forEach(w => {
    r.push(`  [${w.ernst}] ${w.titel} — ${w.aantal}`);
    if (w.voorbeelden.length) r.push('      ' + w.voorbeelden.join(' | '));
  });

  return r.join('\n');
}

// ------------------------------------------------------------------- dry-run

/** Welke stamgegevens staan er al in Supabase? Nodig om te weten wat er
 *  werkelijk bij zou komen, in plaats van wat de code standaard kent. */
async function huidigeStamgegevens(sb) {
  const haal = async (tabel, veld) => {
    const { data, error } = await sb.from(tabel).select(veld).is('deleted_at', null);
    if (error) throw error;
    return new Set((data || []).map(r => String(r[veld])));
  };
  return {
    grootboeknummers: await haal('grootboekrekeningen', 'nummer'),
    bankrekeningnummers: await haal('bankrekeningen', 'nummer'),
    groepnamen: new Set([...(await haal('productgroepen', 'naam'))].map(n => n.toLowerCase()))
  };
}

/** Wat staat er op dit moment in Supabase? */
async function huidigeAantallen(sb) {
  const tabellen = [
    'grootboekrekeningen', 'bankrekeningen', 'productgroepen', 'transacties',
    'maandsaldi', 'jaartotalen', 'voorraadartikelen', 'voorraadstanden',
    'voorraadmutaties', 'hnvi_loten', 'controle_negeer'
  ];
  const uit = {};
  for (const tabel of tabellen) {
    const { count, error } = await sb.from(tabel)
      .select('id', { count: 'exact', head: true }).is('deleted_at', null);
    uit[tabel] = error ? null : count;
  }
  // controle_negeer heeft geen deleted_at
  const { count: negeerAantal } = await sb.from('controle_negeer')
    .select('id', { count: 'exact', head: true });
  uit.controle_negeer = negeerAantal ?? uit.controle_negeer;
  return uit;
}

/**
 * De proefmigratie. Leest de lokale administratie, leest de stand in Supabase,
 * en zet ernaast wat er zou gebeuren. Schrijft niets.
 */
export async function dryRun() {
  const plan = bouwPlan();
  const totalen = financieleTotalen(plan);

  let inDatabase = null, stam = null, fout = null;
  try {
    const sb = await getClient();
    inDatabase = await huidigeAantallen(sb);
    stam = await huidigeStamgegevens(sb);
  } catch (e) {
    fout = leesbareFout(e);
  }

  // Wat er werkelijk nog ontbreekt, gemeten aan de database zelf. Zonder deze
  // stap zou de proefmigratie rekeningen tellen die er allang staan.
  const nieuweNummers = stam
    ? plan.gebruikteNummers.filter(nr => !stam.grootboeknummers.has(nr))
    : plan.ontbrekendeNummers;
  const nieuweRekeningen = stam
    ? plan.gebruikteRekeningen.filter(nr => !stam.bankrekeningnummers.has(nr))
    : plan.ontbrekendeRekeningen;
  const nieuweGroepen = stam
    ? plan.productgroepen.filter(g => !stam.groepnamen.has(String(g.naam).toLowerCase()))
    : plan.productgroepen;

  plan.nieuweNummers = nieuweNummers;
  plan.nieuweRekeningen = nieuweRekeningen;
  plan.nieuweGroepen = nieuweGroepen;

  // Wat er per tabel bij zou komen. Grootboekrekeningen en bankrekeningen
  // staan er al; daar komen alleen de ontbrekende nummers bij.
  const regels = [
    { tabel: 'transacties', toevoegen: plan.boekingen.length,
      toelichting: plan.perJaar.map(j => `${j.jaar}: ${j.aantal}`).join(' · ') },
    { tabel: 'grootboekrekeningen', toevoegen: nieuweNummers.length,
      toelichting: nieuweNummers.length
        ? `${plan.gebruikteNummers.length} nummers in gebruik, nieuw: ${nieuweNummers.join(', ')}`
        : `${plan.gebruikteNummers.length} nummers in gebruik, staan er allemaal al` },
    { tabel: 'bankrekeningen', toevoegen: nieuweRekeningen.length,
      toelichting: nieuweRekeningen.length
        ? `nieuw: ${nieuweRekeningen.join(', ')}`
        : `${plan.gebruikteRekeningen.length} in gebruik, staan er al` },
    { tabel: 'maandsaldi', toevoegen: plan.maandsaldi.length,
      toelichting: plan.maandsaldi.length ? `${plan.maandsaldi[0].maand} t/m ${plan.maandsaldi[plan.maandsaldi.length - 1].maand}` : '' },
    { tabel: 'jaartotalen', toevoegen: plan.jaartotalen.length,
      toelichting: plan.jaartotalen.map(j => j.jaar).join(', ') },
    { tabel: 'productgroepen', toevoegen: nieuweGroepen.length,
      toelichting: nieuweGroepen.length
        ? `nieuw: ${nieuweGroepen.map(g => g.naam).join(', ')}`
        : `${plan.productgroepen.length} groepen, staan er al en worden gekoppeld` },
    { tabel: 'voorraadartikelen', toevoegen: plan.artikelen.length, toelichting: '' },
    { tabel: 'voorraadstanden', toevoegen: plan.voorraadstanden.length,
      toelichting: 'vastgelegde eindstanden per jaar' },
    { tabel: 'voorraadmutaties', toevoegen: plan.voorraadmutaties.length,
      toelichting: 'één beginstand per artikel' },
    { tabel: 'hnvi_loten', toevoegen: plan.loten.length, toelichting: '' },
    { tabel: 'controle_negeer', toevoegen: plan.genegeerdeMeldingen.length + plan.uitgezetteControles.length,
      toelichting: `${plan.genegeerdeMeldingen.length} meldingen, ${plan.uitgezetteControles.length} uitgezette controles` }
  ];

  const waarschuwingen = controleerPlan(plan);
  const heeftFouten = waarschuwingen.some(w => w.ernst === 'fout');

  return { plan, totalen, waarschuwingen, regels, inDatabase, fout, heeftFouten };
}
