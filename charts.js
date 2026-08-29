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

/** Basisopties die elke grafiek in de app deelt — PUZZLE MODERNE STIJL */
export function baseOpts({ legend = true, yFmt = null } = {}) {
  const tekst = cssVar('--text-muted');
  const tekstBold = cssVar('--text');
  const grid = cssVar('--ch-grid');
  const surface = cssVar('--surface-2');
  const border = cssVar('--border-strong');
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 800,
      easing: 'easeInOutQuart',
      delay: (ctx) => ctx.dataIndex * 50
    },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: legend,
        position: 'bottom',
        labels: {
          font: { size: 12, weight: '500' },
          boxWidth: 10,
          boxHeight: 10,
          usePointStyle: true,
          pointStyle: 'circle',
          color: tekstBold,
          padding: 16,
          generateLabels: (chart) => {
            const { data } = chart;
            return data.labels?.map((label, i) => ({
              text: label,
              fillStyle: data.datasets[i]?.backgroundColor || data.datasets[i]?.borderColor,
              hidden: false,
              index: i
            })) || [];
          }
        }
      },
      tooltip: {
        backgroundColor: surface,
        titleColor: tekstBold,
        bodyColor: tekst,
        borderColor: border,
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
        displayColors: true,
        boxWidth: 10,
        boxHeight: 10,
        usePointStyle: true,
        pointStyle: 'circle',
        bodyFont: { size: 12 },
        titleFont: { size: 13, weight: 'bold' }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        border: { color: grid, display: false },
        ticks: {
          font: { size: 11, weight: '500' },
          color: tekst,
          maxRotation: 0,
          autoSkipPadding: 12
        }
      },
      y: {
        grid: { color: grid, lineWidth: 0.5, drawTicks: false },
        border: { display: false },
        ticks: {
          font: { size: 11, weight: '500' },
          color: tekst,
          callback: yFmt || (v => v),
          padding: 8
        }
      }
    }
  };
}
