// negeren.js — meldingen van de controlepagina verbergen en weer terughalen.
//
// Drie manieren, met elk een eigen gedrag:
//   'negeren'  — deze melding verbergen zolang de gegevens niet veranderen
//   'opgelost' — hetzelfde, maar met de aantekening dat je het hebt opgelost
//   'nooit'    — de hele controle uitzetten, ook voor toekomstige gevallen
//
// Bij de eerste twee wordt een vingerafdruk van de melding bewaard. Verandert de
// onderliggende boeking, dan komt de melding terug: je hebt hem immers voor een
// oudere situatie weggeklikt.

const SLEUTEL = 'xtenate_controle_negeer';

const leeg = () => ({ meldingen: {}, controles: {} });

function lees() {
  try {
    const ruw = localStorage.getItem(SLEUTEL);
    if (!ruw) return leeg();
    const data = JSON.parse(ruw);
    return { meldingen: data.meldingen || {}, controles: data.controles || {} };
  } catch {
    return leeg();
  }
}

let opgeslagen = lees();

function bewaar() {
  try {
    localStorage.setItem(SLEUTEL, JSON.stringify(opgeslagen));
  } catch (e) {
    console.warn('Kon de genegeerde meldingen niet bewaren:', e);
  }
}

export const REDEN_LABEL = {
  negeren: 'Genegeerd',
  opgelost: 'Als opgelost gemarkeerd',
  nooit: 'Controle uitgezet'
};

/** Unieke sleutel van één melding binnen één controle. */
export const meldingSleutel = (controleId, itemSleutel) => `${controleId}::${itemSleutel}`;

/** Staat deze melding op verborgen? */
export function isVerborgen(controleId, itemSleutel, vinger) {
  if (opgeslagen.controles[controleId]) return true;
  const bewaard = opgeslagen.meldingen[meldingSleutel(controleId, itemSleutel)];
  if (!bewaard) return false;
  // Andere gegevens dan toen je hem wegklikte: opnieuw tonen.
  return bewaard.vinger === vinger;
}

export function isControleUit(controleId) {
  return !!opgeslagen.controles[controleId];
}

export function verbergMelding(controleId, itemSleutel, { vinger, label, controleTitel, reden }) {
  opgeslagen.meldingen[meldingSleutel(controleId, itemSleutel)] = {
    controleId, itemSleutel, vinger, label, controleTitel, reden,
    wanneer: new Date().toISOString().slice(0, 10)
  };
  bewaar();
}

export function zetControleUit(controleId, controleTitel) {
  opgeslagen.controles[controleId] = { controleTitel, wanneer: new Date().toISOString().slice(0, 10) };
  bewaar();
}

export function herstelMelding(sleutel) {
  delete opgeslagen.meldingen[sleutel];
  bewaar();
}

export function herstelControle(controleId) {
  delete opgeslagen.controles[controleId];
  bewaar();
}

export function herstelAlles() {
  opgeslagen = leeg();
  bewaar();
}

/** Alles wat op dit moment verborgen is, om onderaan de pagina te tonen. */
export function verborgenOverzicht() {
  return {
    meldingen: Object.entries(opgeslagen.meldingen).map(([sleutel, m]) => ({ sleutel, ...m })),
    controles: Object.entries(opgeslagen.controles).map(([id, c]) => ({ id, ...c }))
  };
}

export function aantalVerborgen() {
  return Object.keys(opgeslagen.meldingen).length + Object.keys(opgeslagen.controles).length;
}
