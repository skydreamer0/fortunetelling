/**
 * @fileoverview Shared Chart Theme Configuration
 *
 * Single source of truth for all chart styling: colors, fonts, animations,
 * grids, and labels.  Dark theme with deep navy background and glowing
 * HSL-based accent palette.
 *
 * @module visualization/ChartTheme
 */

// ─── Color Palette ──────────────────────────────────────────────────────────

/**
 * Core background colors (dark navy theme).
 */
export const BACKGROUNDS = {
  /** Chart canvas background */
  canvas: '#f7f4ef',
  /** Slightly lighter panel background */
  panel: '#f0ebe1',
  /** Card / tooltip background */
  card: '#ffffff',
  /** Overlay / modal background */
  overlay: 'rgba(247, 244, 239, 0.95)',
  /** Grid line color */
  grid: 'rgba(92, 83, 70, 0.08)',
  /** Grid line color (emphasized) */
  gridStrong: 'rgba(92, 83, 70, 0.18)'
};

/**
 * HSL-based accent palette. Each system gets a distinct hue for visual
 * differentiation across charts and legends.
 *
 * @type {Record<string, { hue: number, solid: string, glow: string, fill: string, light: string }>}
 */
export const SYSTEM_COLORS = {
  bazi: {
    hue: 6,
    solid: '#a83f39',
    glow: 'rgba(168, 63, 57, 0.45)',
    fill: 'rgba(168, 63, 57, 0.08)',
    light: '#cca5a1'
  },
  ziwei: {
    hue: 40,
    solid: '#b79552',
    glow: 'rgba(183, 149, 82, 0.45)',
    fill: 'rgba(183, 149, 82, 0.08)',
    light: '#dcc699'
  },
  vedic: {
    hue: 180,
    solid: '#527878',
    glow: 'rgba(82, 120, 120, 0.45)',
    fill: 'rgba(82, 120, 120, 0.08)',
    light: '#a6c0c0'
  },
  numerology: {
    hue: 147,
    solid: '#4f7660',
    glow: 'rgba(79, 118, 96, 0.45)',
    fill: 'rgba(79, 118, 96, 0.08)',
    light: '#a3c0b0'
  },
  humandesign: {
    hue: 6,
    solid: '#8f3028',
    glow: 'rgba(143, 48, 40, 0.45)',
    fill: 'rgba(143, 48, 40, 0.08)',
    light: '#d6a3a0'
  },
  cross_system: {
    hue: 40,
    solid: '#b79552',
    glow: 'rgba(183, 149, 82, 0.45)',
    fill: 'rgba(183, 149, 82, 0.08)',
    light: '#dcc699'
  }
};

/**
 * Generate a harmonious multi-dataset palette from a base hue.
 * Each successive dataset rotates the hue by a golden-angle increment.
 *
 * @param {number} baseHue - Starting hue (0-360)
 * @param {number} count   - Number of datasets
 * @returns {{ solid: string, glow: string, fill: string }[]}
 */
export function generateDatasetPalette(baseHue, count) {
  const goldenAngle = 137.508;
  const palette = [];
  for (let i = 0; i < count; i++) {
    const hue = (baseHue + i * goldenAngle) % 360;
    palette.push({
      solid: `hsl(${hue}, 85%, 60%)`,
      glow: `hsla(${hue}, 85%, 60%, 0.55)`,
      fill: `hsla(${hue}, 85%, 60%, 0.12)`
    });
  }
  return palette;
}

// ─── Five Elements Colors ───────────────────────────────────────────────────

/**
 * Traditional Chinese five-element color mapping (for BaZi/ZiWei).
 */
export const ELEMENT_COLORS = {
  木: { solid: '#5a866d', fill: 'rgba(90, 134, 109, 0.2)' },
  火: { solid: '#ad4f46', fill: 'rgba(173, 79, 70, 0.2)' },
  土: { solid: '#ad8948', fill: 'rgba(173, 137, 72, 0.2)' },
  金: { solid: '#bcb3a4', fill: 'rgba(188, 179, 164, 0.2)' },
  水: { solid: '#5c7c82', fill: 'rgba(92, 124, 130, 0.2)' }
};

// ─── Typography ─────────────────────────────────────────────────────────────

/**
 * Font stack used across all charts.
 * Primary: Inter (Latin), Noto Sans TC (Chinese).
 */
export const FONTS = {
  family: "'Noto Sans TC', 'Inter', 'PingFang TC', 'Microsoft JhengHei', sans-serif",
  sizeTitle: 16,
  sizeLabel: 13,
  sizeTick: 11,
  sizeTooltip: 12,
  sizeLegend: 12,
  weightNormal: 400,
  weightMedium: 500,
  weightBold: 700
};

// ─── Animation ──────────────────────────────────────────────────────────────

/**
 * Shared animation timing presets.
 */
export const ANIMATION = {
  /** Duration for initial chart drawing (ms) */
  drawDuration: 1200,
  /** Duration for data updates (ms) */
  updateDuration: 600,
  /** Easing for drawing */
  drawEasing: 'easeOutQuart',
  /** Easing for updates */
  updateEasing: 'easeInOutCubic',
  /** Delay between dataset animations (ms) */
  datasetDelay: 200
};

// ─── Text Colors ────────────────────────────────────────────────────────────

export const TEXT_COLORS = {
  primary: '#2c2a29',
  secondary: '#5c5346',
  muted: '#8c8170',
  accent: '#a83f39'
};

// ─── Tooltip Theme ──────────────────────────────────────────────────────────

/**
 * Build a standard Chart.js tooltip configuration.
 *
 * @param {Object} [overrides] - Override any tooltip option
 * @returns {Object} Chart.js tooltip plugin config
 */
export function buildTooltipConfig(overrides = {}) {
  return {
    enabled: true,
    backgroundColor: BACKGROUNDS.card,
    titleColor: TEXT_COLORS.primary,
    bodyColor: TEXT_COLORS.secondary,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    cornerRadius: 8,
    padding: { top: 10, bottom: 10, left: 14, right: 14 },
    titleFont: {
      family: FONTS.family,
      size: FONTS.sizeTooltip,
      weight: FONTS.weightBold
    },
    bodyFont: {
      family: FONTS.family,
      size: FONTS.sizeTooltip,
      weight: FONTS.weightNormal
    },
    displayColors: true,
    boxPadding: 4,
    ...overrides
  };
}

// ─── Legend Theme ───────────────────────────────────────────────────────────

/**
 * Build a standard Chart.js legend configuration.
 *
 * @param {Object} [overrides]
 * @returns {Object}
 */
export function buildLegendConfig(overrides = {}) {
  return {
    display: true,
    position: 'bottom',
    labels: {
      color: TEXT_COLORS.secondary,
      font: {
        family: FONTS.family,
        size: FONTS.sizeLegend,
        weight: FONTS.weightMedium
      },
      padding: 16,
      usePointStyle: true,
      pointStyle: 'circle'
    },
    ...overrides
  };
}

// ─── Radar Specific ─────────────────────────────────────────────────────────

/**
 * Build Chart.js scale config for a radar chart.
 *
 * @param {number} [maxValue=100]
 * @param {Object} [overrides]
 * @returns {Object}
 */
export function buildRadarScaleConfig(maxValue = 100, overrides = {}) {
  return {
    r: {
      min: 0,
      max: maxValue,
      beginAtZero: true,
      ticks: {
        stepSize: maxValue / 5,
        display: false,
        backdropColor: 'transparent'
      },
      grid: {
        color: BACKGROUNDS.grid,
        lineWidth: 1
      },
      angleLines: {
        color: BACKGROUNDS.gridStrong,
        lineWidth: 1
      },
      pointLabels: {
        color: TEXT_COLORS.primary,
        font: {
          family: FONTS.family,
          size: FONTS.sizeLabel,
          weight: FONTS.weightMedium
        },
        padding: 12
      },
      ...overrides
    }
  };
}

// ─── Bar Specific ───────────────────────────────────────────────────────────

/**
 * Build Chart.js scale configs for a horizontal bar chart.
 *
 * @param {Object} [overrides]
 * @returns {Object}
 */
export function buildBarScaleConfig(overrides = {}) {
  return {
    x: {
      grid: {
        color: BACKGROUNDS.grid,
        lineWidth: 1
      },
      ticks: {
        color: TEXT_COLORS.secondary,
        font: {
          family: FONTS.family,
          size: FONTS.sizeTick
        }
      },
      ...(overrides.x ?? {})
    },
    y: {
      grid: {
        display: false
      },
      ticks: {
        color: TEXT_COLORS.primary,
        font: {
          family: FONTS.family,
          size: FONTS.sizeLabel,
          weight: FONTS.weightMedium
        },
        padding: 8
      },
      ...(overrides.y ?? {})
    }
  };
}

// ─── Canvas Background Plugin ───────────────────────────────────────────────

/**
 * Chart.js plugin that fills the canvas background with the theme color.
 *
 * @param {string} [bgColor] - Override background color
 * @returns {Object} Chart.js plugin object
 */
export function createBackgroundPlugin(bgColor = BACKGROUNDS.canvas) {
  return {
    id: 'darkBackground',
    beforeDraw(chart) {
      const { ctx } = chart;
      ctx.save();
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, chart.width, chart.height);
      ctx.restore();
    }
  };
}

/**
 * Chart.js plugin that draws a glow effect behind dataset lines.
 *
 * @returns {Object} Chart.js plugin object
 */
export function createGlowPlugin() {
  return {
    id: 'lineGlow',
    beforeDatasetDraw(chart, args) {
      const { ctx } = chart;
      const meta = args.meta;
      if (!meta.dataset) return;

      const borderColor = meta.dataset.options?.borderColor;
      if (!borderColor) return;

      ctx.save();
      ctx.shadowColor = borderColor;
      ctx.shadowBlur = 12;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    },
    afterDatasetDraw(chart) {
      chart.ctx.restore();
    }
  };
}

// ─── Utility ────────────────────────────────────────────────────────────────

/**
 * Get the color set for a given source system, with fallback.
 *
 * @param {string} systemId
 * @returns {{ solid: string, glow: string, fill: string, light: string }}
 */
export function getSystemColor(systemId) {
  return SYSTEM_COLORS[systemId] ?? {
    hue: 0,
    solid: 'hsl(0, 0%, 65%)',
    glow: 'hsla(0, 0%, 65%, 0.6)',
    fill: 'hsla(0, 0%, 65%, 0.15)',
    light: 'hsl(0, 0%, 82%)'
  };
}

/**
 * Build a CSS-ready gradient string for a given hue (for bar fills, etc.).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} hue
 * @param {'horizontal'|'vertical'} [direction='horizontal']
 * @param {number} [width=300]
 * @param {number} [height=20]
 * @returns {CanvasGradient}
 */
export function createBarGradient(ctx, hue, direction = 'horizontal', width = 300, height = 20) {
  const gradient = direction === 'horizontal'
    ? ctx.createLinearGradient(0, 0, width, 0)
    : ctx.createLinearGradient(0, 0, 0, height);

  gradient.addColorStop(0, `hsla(${hue}, 90%, 45%, 0.9)`);
  gradient.addColorStop(0.5, `hsla(${hue}, 90%, 55%, 0.95)`);
  gradient.addColorStop(1, `hsla(${hue}, 90%, 65%, 1)`);
  return gradient;
}
