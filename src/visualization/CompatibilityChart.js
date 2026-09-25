import Chart from 'chart.js/auto';
import {
  ANIMATION,
  buildLegendConfig,
  buildRadarScaleConfig,
  buildTooltipConfig,
  chartAnimationDuration,
  createBackgroundPlugin,
  getRuntimeChartTheme,
} from './ChartTheme.js';

export function buildCompatibilityChartConfig(elements) {
  const axes = elements?.axes ?? [];
  const theme = getRuntimeChartTheme();
  return {
    type: 'radar',
    data: {
      labels: axes.map(axis => axis.label),
      datasets: [
        {
          label: '互補軸',
          data: axes.map(axis => axis.complement),
          borderColor: theme.jade,
          backgroundColor: 'rgba(79, 118, 96, 0.12)',
          pointBackgroundColor: theme.jade,
          borderWidth: 2,
        },
        {
          label: '共同過度集中（摩擦軸）',
          data: axes.map(axis => axis.friction),
          borderColor: theme.red,
          backgroundColor: 'rgba(168, 63, 57, 0.08)',
          pointBackgroundColor: theme.red,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: chartAnimationDuration(), easing: ANIMATION.drawEasing },
      scales: buildRadarScaleConfig(100),
      plugins: {
        legend: buildLegendConfig(),
        tooltip: buildTooltipConfig({
          callbacks: {
            afterBody: items => {
              const axis = axes[items[0]?.dataIndex];
              return axis ? [`A ${axis.firstShare}% · B ${axis.secondShare}% · 平均 ${axis.combinedShare}%`] : [];
            },
          },
        }),
      },
    },
    plugins: [createBackgroundPlugin()],
  };
}

export function renderCompatibilityChart(canvas, elements) {
  return new Chart(canvas, buildCompatibilityChartConfig(elements));
}
