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
        backgroundColor: vlakKleur,
        titleColor: kop,
        bodyColor: tekst,
        borderColor: rand,
        borderWidth: 1,
        padding: 11,
        cornerRadius: 8,
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

/** Standaardvorm voor een staafreeks. */
export function staaf(label, data, kleur) {
  return {
    label, data,
    backgroundColor: alpha(kleur, 0.85),
    hoverBackgroundColor: kleur,
    borderRadius: 4,
    borderSkipped: false,
    maxBarThickness: 26
  };
}

/** Standaardvorm voor een lijnreeks met verloopvlak eronder. */
export function lijn(label, data, kleur, { vulling = true, punten = true } = {}) {
  return {
    label, data,
    borderColor: kleur,
    backgroundColor: vulling ? (ctx => vlak(ctx, kleur)) : 'transparent',
    fill: vulling,
    tension: 0.35,
    borderWidth: 2,
    pointRadius: punten ? 2.5 : 0,
    pointHoverRadius: 5,
    pointBackgroundColor: kleur,
    pointBorderColor: cssVar('--surface'),
    pointBorderWidth: 2
  };
}
