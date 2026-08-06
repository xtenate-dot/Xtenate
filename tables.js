// tables.js — sorteerbare tabelkoppen.
// Werkt op elke tabel: geef koppen een data-sort ("tekst", "getal" of "datum").
// Cellen mogen een data-v meegeven met de ruwe waarde; anders wordt de tekst gebruikt.

function waarde(rij, index, soort) {
  const cel = rij.children[index];
  if (!cel) return soort === 'tekst' ? '' : 0;
  const ruw = cel.dataset.v !== undefined ? cel.dataset.v : cel.textContent.trim();
  if (soort === 'getal') {
    const n = parseFloat(String(ruw).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }
  return String(ruw).toLowerCase();
}

/** Maakt alle koppen met data-sort in deze tabel klikbaar. */
export function maakSorteerbaar(tabel) {
  if (!tabel || tabel.dataset.sortKlaar === '1') return;
  tabel.dataset.sortKlaar = '1';

  const koppen = [...tabel.querySelectorAll('thead th')];
  koppen.forEach((th, index) => {
    const soort = th.dataset.sort;
    if (!soort) return;
    th.classList.add('sortable');
    th.tabIndex = 0;
    th.setAttribute('role', 'button');

    const sorteer = () => {
      const oplopend = !th.classList.contains('sort-asc');
      koppen.forEach(k => k.classList.remove('sort-asc', 'sort-desc'));
      th.classList.add(oplopend ? 'sort-asc' : 'sort-desc');

      const body = tabel.querySelector('tbody');
      const rijen = [...body.querySelectorAll('tr')].filter(r => !r.dataset.geenSort);
      rijen.sort((a, b) => {
        const va = waarde(a, index, soort), vb = waarde(b, index, soort);
        if (va < vb) return oplopend ? -1 : 1;
        if (va > vb) return oplopend ? 1 : -1;
        return 0;
      });
      rijen.forEach(r => body.appendChild(r));
    };

    th.addEventListener('click', sorteer);
    th.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sorteer(); } });
  });
}

/** Past maakSorteerbaar toe op elke tabel met de class .js-sorteerbaar. */
export function initSorteerbareTabellen(root = document) {
  root.querySelectorAll('table.js-sorteerbaar').forEach(maakSorteerbaar);
}
