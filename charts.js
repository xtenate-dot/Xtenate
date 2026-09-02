// charts.js — beheer van Chart.js-instanties en gedeelde vormgeving.
// Kleuren komen uit de CSS-variabelen, zodat grafieken meebewegen met het thema.

export let charts = {};

export function dc(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

/** Vernietigt alle grafieken — gebruikt bij het wisselen van thema. */
export function destroyAll() { Object.keys(charts).forEach(dc); }

/** Leest een CSS-variabele uit de huidige thema-context. */
export function cssVar(naam) {
  return getComputedStyle(document.documentElement).getPropertyValue(naam).trim();
}

/** Het vaste grafiekpalet, in volgorde. */
/**
 * Het losse palet, voor grafieken waar geen vaste categorie aan hangt: reeksen
 * die per maand of per periode lopen en waar de volgorde de betekenis draagt.
 * Voor grootboeken en kanalen niet gebruiken — die horen kleurVoorGb() te
 * gebruiken, anders verspringt een categorie van kleur zodra de rangorde
 * verandert.
 */
export function palette() {
  return ['--chart-color-1','--chart-color-2','--chart-color-3','--chart-color-4','--chart-color-5','--chart-color-6'].map(cssVar);
}

/**
 * Vaste kleur per grootboek. Een categorie houdt zo dezelfde kleur in elke
 * grafiek, ongeacht positie of bedrag. Eerder werd de kleur toegekend op index
 * na sortering op bedrag, waardoor bankkosten de ene maand paars konden zijn en
 * de volgende amber, en waardoor dezelfde index in twee grafieken iets anders
 * betekende.
 *
 * De indeling volgt de grootboekfamilies, met binnen elke familie duidelijk
 * verschillende kleuren. Omzetkanalen staan bewust ver uit elkaar: dat zijn de
 * drie die je het vaakst naast elkaar ziet.
 */
export const KLEUR_PER_GB = {
  // Omzet per kanaal
  '8000': '--cat-1',    // Xtenate        cyaan
  '8010': '--cat-2',    // Bol.com        roze
  '8020': '--cat-3',    // Helmetstore    limoen

  // Inkoop
  '7000': '--cat-4',    // AliExpress     lila
  '7010': '--cat-5',    // HNVI           hemelblauw
  '7020': '--cat-6',    // MijnMagie      koraal
  '7100': '--cat-7',    // Verzendartikelen turkoois
  '7350': '--cat-8',    // Uitbestede diensten magenta
  '7900': '--cat-9',    // Transportkosten indigo

  // Bedrijfskosten
  '4230': '--cat-10',   // Kantoorbenodigdheden abrikoos
  '4235': '--cat-11',   // Kleine aanschaf inv. leisteen
  '4290': '--cat-12',   // Overige zakelijke aank. mint
  '4350': '--cat-13',   // Bankkosten      lichtlila
  '4410': '--cat-14',   // Huur/huisvesting lichtblauw
  '4640': '--cat-15',   // Reiskosten      lichtlimoen
  '4760': '--cat-16',   // Abonnement      lichtgrijs
  '4810': '--cat-17',   // Reclame         lichtmagenta
  '4815': '--cat-18',   // Website         ijsblauw
  '4895': '--cat-19',   // Overige verkoopkosten periwinkel

  // Balansposten
  '600':  '--cat-20',   // Privé storting  lavendel
  '601':  '--cat-11',   // Privé opname    leisteen
  '1520': '--cat-19',   // Vorderingen overig
  '2000': '--cat-16',   // Schulden overig
  '2080': '--cat-18'    // Bankposten in transit
};

/**
 * De kleur van een grootboek. Onbekende rekeningen krijgen de terugvalkleur:
 * bewust neutraal grijsblauw, zodat een nieuwe rekening opvalt als nog niet
 * ingedeeld in plaats van dat hij de kleur van een bestaande categorie leent.
 */
export function kleurVoorGb(gb) {
  const token = KLEUR_PER_GB[String(gb ?? '').trim()];
  return cssVar(token || '--cat-fallback');
}

/** Zet een hexkleur om naar rgba met de gevraagde doorzichtigheid. */
export function alpha(hex, a) {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/**
 * Verticale verloopvulling onder een lijn of boven een staaf.
 * Valt terug op een egale kleur wanneer het tekenvlak nog geen hoogte heeft.
 */
export function vlak(ctx, kleur, sterkte = 0.28) {
  const gebied = ctx?.chart?.chartArea;
  if (!gebied) return alpha(kleur, sterkte * 0.6);
  const g = ctx.chart.ctx.createLinearGradient(0, gebied.top, 0, gebied.bottom);
  g.addColorStop(0, alpha(kleur, sterkte));
  g.addColorStop(1, alpha(kleur, 0));
  return g;
}

/** Basisopties die elke grafiek in de app deelt. */
export function baseOpts({ legend = true, yFmt = null, tooltipFmt = null } = {}) {
  const tekst = cssVar('--text-secondary');
  const kop = cssVar('--text-primary');
  const grid = cssVar('--chart-grid');
  const vlakKleur = cssVar('--bg-card');
  const rand = cssVar('--border-strong');

  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 420, easing: 'easeOutQuart' },
    animations: { colors: false },
    interaction: { mode: 'index', intersect: false },
    layout: { padding: { top: 4 } },
    plugins: {
      legend: {
        display: legend,
        position: 'bottom',
        labels: {
          font: { size: 11.5, family: cssVar('--font-family-base') || undefined },
          boxWidth: 8, boxHeight: 8,
          usePointStyle: true, pointStyle: 'circle',
          color: tekst,
          padding: 16
        }
      },
      tooltip: {
        backgroundColor: cssVar('--bg-elevated') || vlakKleur,
        titleColor: kop,
        bodyColor: tekst,
        borderColor: cssVar('--border-purple-strong') || rand,
        borderWidth: 1,
        padding: 14,
        cornerRadius: 12,
        displayColors: true,
        boxWidth: 8, boxHeight: 8, boxPadding: 4,
        usePointStyle: true,
        titleFont: { size: 12, weight: '600' },
        bodyFont: { size: 12 },
        caretSize: 5,
        callbacks: tooltipFmt ? { label: tooltipFmt } : {}
      }
    },
    scales: {
      x: {
        grid: { display: false },
        border: { color: cssVar('--chart-grid') },
        ticks: {
          font: { size: 10.5 }, color: cssVar('--chart-axis'),
          maxRotation: 0, autoSkipPadding: 12, padding: 8
        }
      },
      y: {
        grid: { color: grid, drawTicks: false },
        border: { display: false, dash: [3, 3] },
        ticks: {
          font: { size: 10.5 }, color: cssVar('--chart-axis'),
          callback: yFmt || (v => v), padding: 10
        }
      }
    }
  };
}

/**
 * Tekent het totaalbedrag in het midden van een donut. Het gat is anders
 * loze ruimte, terwijl juist dáár het cijfer hoort dat de segmenten optellen.
 */
export function donutMidden(bedrag, bijschrift = 'Totale kosten') {
  return {
    id: 'donutMidden',
    afterDraw(chart) {
      const gebied = chart.chartArea;
      if (!gebied) return;
      const c = chart.ctx;
      const x = (gebied.left + gebied.right) / 2;
      const y = (gebied.top + gebied.bottom) / 2;
      const font = cssVar('--font-family-base') || 'sans-serif';

      c.save();
      c.textAlign = 'center';
      c.textBaseline = 'middle';

      c.font = `500 10px ${font}`;
      c.fillStyle = cssVar('--text-muted');
      c.fillText(bijschrift.toUpperCase(), x, y - 13);

      c.font = `600 17px ${font}`;
      c.fillStyle = cssVar('--text-primary');
      c.fillText(bedrag, x, y + 6);

      c.restore();
    }
  };
}

/** Staafreeks met een subtiel verticaal verloop in plaats van een vlakke vulling. */
export function staaf(label, data, kleur) {
  return {
    label, data,
    backgroundColor: (ctx) => {
      const gebied = ctx?.chart?.chartArea;
      if (!gebied) return alpha(kleur, 0.7);
      const g = ctx.chart.ctx.createLinearGradient(0, gebied.top, 0, gebied.bottom);
      g.addColorStop(0, alpha(kleur, 1));
      g.addColorStop(1, alpha(kleur, 0.38));
      return g;
    },
    hoverBackgroundColor: kleur,
    borderRadius: 7,
    borderSkipped: false,
    maxBarThickness: 28
  };
}

/** Lijnreeks met verloopvlak eronder en een zachte gloed op de lijn zelf. */
export function lijn(label, data, kleur, { vulling = true, punten = true, gloed = false } = {}) {
  const ds = {
    label, data,
    borderColor: kleur,
    backgroundColor: vulling ? (ctx => vlak(ctx, kleur, 0.42)) : 'transparent',
    fill: vulling,
    tension: 0.38,
    borderWidth: 2.2,
    pointRadius: punten ? 0 : 0,
    pointHoverRadius: 5,
    pointHoverBorderWidth: 2,
    pointBackgroundColor: kleur,
    pointBorderColor: cssVar('--bg-card'),
    pointBorderWidth: 2
  };
  if (gloed) {
    ds.borderWidth = 2.4;
    ds.segment = {};
    ds.shadowKleur = kleur;
  }
  return ds;
}

/**
 * Chart.js-plugin die een zachte gloed onder de lijn tekent. Alleen actief
 * voor reeksen die daar expliciet om vragen (gloed: true).
 */
export const lijnGloed = {
  id: 'lijnGloed',
  beforeDatasetDraw(chart, args) {
    const ds = chart.data.datasets[args.index];
    if (!ds || !ds.shadowKleur) return;
    const c = chart.ctx;
    c.save();
    c.shadowColor = alpha(ds.shadowKleur, 0.5);
    c.shadowBlur = 20;
    c.shadowOffsetY = 4;
  },
  afterDatasetDraw(chart, args) {
    const ds = chart.data.datasets[args.index];
    if (!ds || !ds.shadowKleur) return;
    chart.ctx.restore();
  }
};
