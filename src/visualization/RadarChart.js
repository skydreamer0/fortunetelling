/** @fileoverview Chart.js adapter for report Radar objects. */

import Chart from 'chart.js/auto';
import {
  ANIMATION,
  buildLegendConfig,
  buildRadarScaleConfig,
  buildTooltipConfig,
  createBackgroundPlugin,
  createGlowPlugin,
  getSystemColor,
} from './ChartTheme.js';

/** Build a Chart.js radar configuration without touching the DOM. */
export function buildRadarChartConfig(radar) {
  const axes = radar?.axes ?? [];
  const color = getSystemColor(radar?.system);
  const unit = axes[0]?.unit ?? '';

  return {
    type: 'radar',
    data: {
      labels: axes.map(axis => axis.label),
      datasets: [{
        label: radar?.title ?? '',
        data: axes.map(axis => axis.value),
        borderColor: color.solid,
        backgroundColor: color.fill,
        pointBackgroundColor: color.light,
        pointBorderColor: color.solid,
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: color.solid,
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: ANIMATION.drawDuration, easing: ANIMATION.drawEasing },
      scales: buildRadarScaleConfig(100),
      plugins: {
        legend: buildLegendConfig({ display: false }),
        tooltip: buildTooltipConfig({
          callbacks: { label: context => `${context.dataset.label}: ${context.formattedValue}${unit}` },
        }),
      },
    },
    plugins: [createBackgroundPlugin(), createGlowPlugin()],
  };
}

/** Render one Radar into a canvas and return its Chart.js instance. */
export function renderRadarChart(canvas, radar) {
  if (!canvas) throw new TypeError('RadarChart requires a canvas');
  return new Chart(canvas, buildRadarChartConfig(radar));
}
