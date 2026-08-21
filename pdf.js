// pdf.js — maakt een pdf van platte tekst, zonder externe bibliotheek.
//
// De app draait van een eigen map en mag niet afhankelijk zijn van een cdn:
// zonder internet moet een aangifte nog steeds te downloaden zijn. Daarom
// schrijven we het pdf-formaat hier zelf. Dat kan, want we hebben maar één
// ding nodig: regels tekst in een standaardlettertype op A4.

const A4 = { breed: 595.28, hoog: 841.89 };
const MARGE = 56;          // ~2 cm
const REGELHOOGTE = 14;
const CORPS = 10;
const KOP_CORPS = 15;

// De standaardlettertypen van pdf gebruiken WinAnsi. Dat is bijna latin-1,
// met een paar afwijkingen in het bereik 0x80–0x9F. Het euroteken is de
// belangrijkste: dat zit op 0x80 en zou anders als vraagteken eindigen.
const WINANSI_AFWIJKEND = {
  0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A,
  0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
  0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
  0x017E: 0x9E, 0x0178: 0x9F,
  0x202F: 0x20, 0x00A0: 0x20   // smalle en vaste spatie worden gewone spatie
};

/** Tekst naar WinAnsi-bytes; onbekende tekens worden een vraagteken. */
function naarWinAnsi(tekst) {
  const uit = [];
  for (const teken of String(tekst)) {
    const code = teken.codePointAt(0);
    if (code === 0x0A) continue;
    if (WINANSI_AFWIJKEND[code] != null) uit.push(WINANSI_AFWIJKEND[code]);
    else if (code <= 0xFF) uit.push(code);
    else uit.push(0x3F);
  }
  return uit;
}

/** Haakjes en backslash hebben betekenis in een pdf-string. */
function ontsnap(bytes) {
  const uit = [];
  for (const b of bytes) {
    if (b === 0x28 || b === 0x29 || b === 0x5C) uit.push(0x5C);
    uit.push(b);
  }
  return uit;
}

/**
 * Breekt een regel af op woordgrenzen. Breedte schatten we op 0,5 × corps per
 * teken: Helvetica is smaller, dus we houden marge over en niets valt weg.
 */
function breekAf(regel, maxBreedte, corps) {
  const perTeken = corps * 0.52;
  const max = Math.max(8, Math.floor(maxBreedte / perTeken));
  if (regel.length <= max) return [regel];

  const uit = [];
  let rest = regel;
  while (rest.length > max) {
    let knip = rest.lastIndexOf(' ', max);
    if (knip <= 0) knip = max;
    uit.push(rest.slice(0, knip));
    rest = rest.slice(knip).replace(/^ +/, '');
  }
  if (rest) uit.push(rest);
  return uit;
}

/**
 * Zet regels om naar pdf-bytes.
 *
 * Regels die volledig uit hoofdletters bestaan behandelen we als kop: in het
 * vette lettertype en met wat lucht erboven. Dat volgt precies de opmaak die
 * aangifteTekst() al gebruikt.
 */
export function tekstNaarPdf(tekst, { titel = 'Document' } = {}) {
  const bruikbaar = A4.breed - MARGE * 2;
  const regels = String(tekst).split('\n');

  // Eerst alles opdelen in pagina's.
  const paginas = [];
  let huidig = [];
  let y = A4.hoog - MARGE;

  const nieuwePagina = () => { paginas.push(huidig); huidig = []; y = A4.hoog - MARGE; };

  regels.forEach((ruw, i) => {
    const isKop = i === 0 || (/[A-ZÀ-Þ]/.test(ruw) && ruw === ruw.toUpperCase() && ruw.trim().length > 2);
    const corps = i === 0 ? KOP_CORPS : CORPS;
    const vet = isKop;
    const lucht = isKop && i > 0 ? 8 : 0;

    if (!ruw.trim()) { y -= REGELHOOGTE * 0.6; return; }

    for (const deel of breekAf(ruw, bruikbaar, corps)) {
      if (y - REGELHOOGTE - lucht < MARGE) nieuwePagina();
      y -= REGELHOOGTE + lucht;
      huidig.push({ tekst: deel, y, corps, vet });
    }
  });
  paginas.push(huidig);

  // Dan de objecten opbouwen. Nummering: 1 catalogus, 2 pagina-boom,
  // 3 gewoon lettertype, 4 vet lettertype, daarna per pagina twee objecten.
  const objecten = [];
  const paginaIds = paginas.map((_, i) => 5 + i * 2);

  objecten[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objecten[2] = `<< /Type /Pages /Kids [${paginaIds.map(id => `${id} 0 R`).join(' ')}] /Count ${paginas.length} >>`;
  objecten[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objecten[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

  const stromen = [];
  paginas.forEach((pagina, i) => {
    const id = paginaIds[i];
    objecten[id] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.breed.toFixed(2)} ${A4.hoog.toFixed(2)}] ` +
                   `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${id + 1} 0 R >>`;

    const stukken = [];
    for (const r of pagina) {
      stukken.push(0x42, 0x54, 0x0A); // BT
      const kop = `/${r.vet ? 'F2' : 'F1'} ${r.corps} Tf 1 0 0 1 ${MARGE.toFixed(2)} ${r.y.toFixed(2)} Tm (`;
      for (const c of kop) stukken.push(c.charCodeAt(0));
      stukken.push(...ontsnap(naarWinAnsi(r.tekst)));
      for (const c of ') Tj\nET\n') stukken.push(c.charCodeAt(0));
    }
    stromen[id + 1] = stukken;
    objecten[id + 1] = null; // stroom, hieronder apart geschreven
  });

  // Alles achter elkaar zetten en de posities bijhouden voor de xref-tabel.
  const uit = [];
  const schrijf = s => { for (const c of s) uit.push(c.charCodeAt(0)); };
  const posities = [];

  schrijf('%PDF-1.4\n');
  // Een paar hoge bytes in het commentaar vertellen lezers dat dit binair is.
  uit.push(0x25, 0xC7, 0xEC, 0x8F, 0xA2, 0x0A);

  const hoogste = 4 + paginas.length * 2;
  for (let nr = 1; nr <= hoogste; nr++) {
    posities[nr] = uit.length;
    if (stromen[nr]) {
      schrijf(`${nr} 0 obj\n<< /Length ${stromen[nr].length} >>\nstream\n`);
      uit.push(...stromen[nr]);
      schrijf('\nendstream\nendobj\n');
    } else {
      schrijf(`${nr} 0 obj\n${objecten[nr]}\nendobj\n`);
    }
  }

  const xref = uit.length;
  schrijf(`xref\n0 ${hoogste + 1}\n0000000000 65535 f \n`);
  for (let nr = 1; nr <= hoogste; nr++) {
    schrijf(`${String(posities[nr]).padStart(10, '0')} 00000 n \n`);
  }
  schrijf(`trailer\n<< /Size ${hoogste + 1} /Root 1 0 R /Info << /Title (${
    String(titel).replace(/[()\\]/g, '')}) /Producer (Xtenate administratie) >> >>\nstartxref\n${xref}\n%%EOF\n`);

  return new Uint8Array(uit);
}

/** Maakt de pdf en zet de download in gang. */
export function downloadPdf(tekst, bestandsnaam, titel) {
  const bytes = tekstNaarPdf(tekst, { titel: titel || bestandsnaam });
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = bestandsnaam;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
