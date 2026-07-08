// helpers.js — pure hulpfuncties en constanten (grootboek-namen, formattering,
// badges). Geen afhankelijkheden van andere modules.

export const GBNM = {
  '600':'Privé storting','601':'Privé opname',
  '4235':'Kleine aanschaf inv.','4290':'Overige zakelijke aank.','4350':'Bankkosten',
  '4760':'Abonnement','4810':'Reclame','4815':'Website','4895':'Overige verkoopkosten',
  '7000':'Inkoop AliExpress','7010':'Inkoop HNVI','7020':'Inkoop MijnMagie',
  '7100':'Inkoop verzendartikelen','7900':'Transportkosten',
  '8000':'Omzet Xtenate','8010':'Omzet Bol.com','8020':'Omzet Helmetstore'
};

export const REKNM = {'1009':'Revolut','1010':'Rabobank','1020':'Paypal','1030':'Creditkaart','1090':'Kruisposten'};

export function isIban(str) {
  return typeof str === 'string' && /^[A-Z]{2}\d{2}[A-Z0-9]{4,}\d*$/.test(str.trim());
}

export function weergaveNaam(t) {
  if (!isIban(t.naam)) return t.naam || '';
  // naam is een IBAN: probeer een echte naam te vinden in omschr (vaak "IBAN:NAAM:rest")
  if (t.omschr) {
    const delen = t.omschr.split(':');
    if (delen.length >= 2 && delen[1].trim()) return delen[1].trim();
    // geen dubbele punt structuur: gebruik omschr zelf als die geen lange code is
    if (t.omschr.length < 60 && !/\d{6,}/.test(t.omschr)) return t.omschr;
  }
  return t.naam; // laatste redmiddel: toch de IBAN
}

export const REK_COLOR = {'1010':'badge-blue','1009':'badge-purple','1030':'badge-amber','1020':'badge-green','1090':'badge-gray'};

export const MAANDEN = {'2026-01':'jan','2026-02':'feb','2026-03':'mrt','2026-04':'apr','2026-05':'mei','2026-06':'jun'};

export const PRIJS_COVER = 31.95;

export const BEGINSALDO_2026 = 183.15;

export const fmt = n => '€\u202f' + Number(n).toLocaleString('nl-NL', {minimumFractionDigits:2, maximumFractionDigits:2});

export const ddmm = d => d.slice(8,10) + '-' + d.slice(5,7);

export const isOmzet = gb => ['8000','8010','8020'].includes(gb);

export const isUitgave = t => t.type === 'uitgave';

export const isInkomst = t => t.type === 'inkomst';

export function rekBadge(rek) {
  return `<span class="badge ${REK_COLOR[rek]||'badge-gray'}">${REKNM[rek]||rek}</span>`;
}

export function typeBadge(type, bedrag) {
  if (type === 'inkomst') return `<span class="pos">+${fmt(bedrag)}</span>`;
  if (type === 'prive_storting') return `<span class="pos">+${fmt(bedrag)}</span>`;
  if (type === 'prive_opname') return `<span class="neg">–${fmt(bedrag)}</span>`;
  return `<span class="neg">–${fmt(bedrag)}</span>`;
}
