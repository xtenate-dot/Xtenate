// charts.js — bijhouden en opruimen van actieve Chart.js instanties.

export let charts = {};

export function dc(id) { if(charts[id]) { charts[id].destroy(); delete charts[id]; } }
