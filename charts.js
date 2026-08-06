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

/** Basisopties die elke grafiek in de app deelt. */
export function baseOpts({ legend = true, yFmt = null } = {}) {
  const tekst = cssVar('--text-muted');
  const grid = cssVar('--ch-grid');
  const surface = cssVar('--surface');
  const border = cssVar('--border-strong');
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 0 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: legend,
        position: 'bottom',
        labels: { font: { size: 11 }, boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: 'circle', color: tekst, padding: 14 }
      },
      tooltip: {
        backgroundColor: surface,
        titleColor: cssVar('--text'),
        bodyColor: tekst,
        borderColor: border,
        borderWidth: 1,
        padding: 10,
        cornerRadius: 6,
        displayColors: true,
        boxWidth: 8, boxHeight: 8, usePointStyle: true
      }
    },
    scales: {
      x: { grid: { display: false }, border: { color: grid }, ticks: { font: { size: 10.5 }, color: tekst, maxRotation: 0, autoSkipPadding: 12 } },
      y: { grid: { color: grid }, border: { display: false }, ticks: { font: { size: 10.5 }, color: tekst, callback: yFmt || (v => v) } }
    }
  };
}
