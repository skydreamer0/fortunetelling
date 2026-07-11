/** @fileoverview Chart.js adapter for report bar-kind Radar objects. */

import Chart from 'chart.js/auto';
import {
  ANIMATION,
  buildBarScaleConfig,
  buildLegendConfig,
  buildTooltipConfig,
  createBackgroundPlugin,
  getSystemColor,
} from './ChartTheme.js';

/** Build a horizontal Chart.js bar configuration without touching the DOM. */
export function buildBarChartConfig(radar) {
  const axes = radar?.axes ?? [];
  const color = getSystemColor(radar?.system);
  const unit = axes[0]?.unit ?? '';

  return {
    type: 'bar',
    data: {
      labels: axes.map(axis => axis.label),
      datasets: [{
        label: radar?.title ?? '',
        data: axes.map(axis => axis.value),
        borderColor: color.solid,
        backgroundColor: color.fill,
        hoverBackgroundColor: color.glow,
        borderWidth: 1,
        borderRadius: 6,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: ANIMATION.drawDuration, easing: ANIMATION.drawEasing },
      scales: buildBarScaleConfig({ x: { beginAtZero: true } }),
      plugins: {
        legend: buildLegendConfig({ display: false }),
        tooltip: buildTooltipConfig({
          callbacks: { label: context => `${context.dataset.label}: ${context.formattedValue}${unit}` },
        }),
      },
    },
    plugins: [createBackgroundPlugin()],
  };
}

/** Render one bar-kind Radar into a canvas and return its Chart.js instance. */
export function renderBarChart(canvas, radar) {
  if (!canvas) throw new TypeError('BarChart requires a canvas');
  return new Chart(canvas, buildBarChartConfig(radar));
}
