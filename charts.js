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
export function palette() {
  return ['--ch-1','--ch-2','--ch-3','--ch-4','--ch-5','--ch-6'].map(cssVar);
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
  const tekst = cssVar('--text-muted');
  const kop = cssVar('--text');
  const grid = cssVar('--ch-grid');
  const vlakKleur = cssVar('--surface');
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
          font: { size: 11.5, family: cssVar('--font') || undefined },
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
        padding: 12,
        cornerRadius: 10,
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
        border: { color: grid },
        ticks: {
          font: { size: 10.5 }, color: tekst,
          maxRotation: 0, autoSkipPadding: 12, padding: 6
        }
      },
      y: {
        grid: { color: grid, drawTicks: false },
        border: { display: false, dash: [3, 3] },
        ticks: {
          font: { size: 10.5 }, color: tekst,
          callback: yFmt || (v => v), padding: 8
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
      const font = cssVar('--font') || 'sans-serif';

      c.save();
      c.textAlign = 'center';
      c.textBaseline = 'middle';

      c.font = `500 10px ${font}`;
      c.fillStyle = cssVar('--text-muted-c') || '#888';
      c.fillText(bijschrift.toUpperCase(), x, y - 13);

      c.font = `600 17px ${font}`;
      c.fillStyle = cssVar('--text-primary') || '#fff';
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
      g.addColorStop(0, alpha(kleur, 0.95));
      g.addColorStop(1, alpha(kleur, 0.45));
      return g;
    },
    hoverBackgroundColor: kleur,
    borderRadius: 5,
    borderSkipped: false,
    maxBarThickness: 26
  };
}

/** Lijnreeks met verloopvlak eronder en een zachte gloed op de lijn zelf. */
export function lijn(label, data, kleur, { vulling = true, punten = true, gloed = false } = {}) {
  const ds = {
    label, data,
    borderColor: kleur,
    backgroundColor: vulling ? (ctx => vlak(ctx, kleur, 0.34)) : 'transparent',
    fill: vulling,
    tension: 0.35,
    borderWidth: 2,
    pointRadius: punten ? 2.5 : 0,
    pointHoverRadius: 5,
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
    c.shadowColor = alpha(ds.shadowKleur, 0.55);
    c.shadowBlur = 16;
    c.shadowOffsetY = 2;
  },
  afterDatasetDraw(chart, args) {
    const ds = chart.data.datasets[args.index];
    if (!ds || !ds.shadowKleur) return;
    chart.ctx.restore();
  }
};
