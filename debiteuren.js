// debiteuren.js — Wie betaalt mij en hoeveel?
// De logica staat in partijen.js, zodat debiteuren en crediteuren elkaars
// knoppen niet meer kapen.

import { tekenPartijen } from './partijen.js?v=20260821h';

const opties = {
  lijstId: 'debiteuren-list',
  totaalId: 'debiteuren-totaal',
  jaarId: 'f-jaar-debiteuren',
  soort: 'inkomst',
  leegTekst: 'Geen inkomsten',
  herteken: () => renderDebiteuren()
};

export function renderDebiteuren() {
  tekenPartijen(opties);
}

export function wisselJaarDebiteuren() {
  renderDebiteuren();
}
