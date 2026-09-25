/**
 * @fileoverview Julian Day, ΔT and equation of time. Pure numeric functions.
 * @module time/astro
 */

const DAY_MS = 86_400_000;
/** JD of the Unix epoch 1970-01-01T00:00:00Z. */
export const JD_UNIX_EPOCH = 2440587.5;
/** JD of J2000.0 (2000-01-01T12:00:00 TT; used here as the epoch for T). */
export const JD_J2000 = 2451545.0;

/** Julian Day (UT scale) of a Unix-ms instant. */
export function julianDayFromUnixMs(utcMs: number): number {
  return utcMs / DAY_MS + JD_UNIX_EPOCH;
}

/**
 * ΔT = TT − UT in seconds, Espenak & Meeus polynomial expressions
 * (NASA GSFC, "Polynomial Expressions for Delta T", Five Millennium Canon of
 * Solar Eclipses, https://eclipse.gsfc.nasa.gov/SEhelp/deltatpoly2004.html).
 * `decimalYear` should be y = year + (month − 0.5)/12 as NASA prescribes.
 * No lunar-acceleration correction is applied (the polynomials already assume
 * ṅ = −26″/cy²).
 */
export function deltaTSeconds(decimalYear: number): number {
  const y = decimalYear;
  if (y < -500) {
    const u = (y - 1820) / 100;
    return -20 + 32 * u * u;
  }
  if (y < 500) {
    const u = y / 100;
    return (
      10583.6 - 1014.41 * u + 33.78311 * u ** 2 - 5.952053 * u ** 3 - 0.1798452 * u ** 4 +
      0.022174192 * u ** 5 + 0.0090316521 * u ** 6
    );
  }
  if (y < 1600) {
    const u = (y - 1000) / 100;
    return (
      1574.2 - 556.01 * u + 71.23472 * u ** 2 + 0.319781 * u ** 3 - 0.8503463 * u ** 4 -
      0.005050998 * u ** 5 + 0.0083572073 * u ** 6
    );
  }
  if (y < 1700) {
    const t = y - 1600;
    return 120 - 0.9808 * t - 0.01532 * t ** 2 + t ** 3 / 7129;
  }
  if (y < 1800) {
    const t = y - 1700;
    return 8.83 + 0.1603 * t - 0.0059285 * t ** 2 + 0.00013336 * t ** 3 - t ** 4 / 1174000;
  }
  if (y < 1860) {
    const t = y - 1800;
    return (
      13.72 - 0.332447 * t + 0.0068612 * t ** 2 + 0.0041116 * t ** 3 - 0.00037436 * t ** 4 +
      0.0000121272 * t ** 5 - 0.0000001699 * t ** 6 + 0.000000000875 * t ** 7
    );
  }
  if (y < 1900) {
    const t = y - 1860;
    return 7.62 + 0.5737 * t - 0.251754 * t ** 2 + 0.01680668 * t ** 3 - 0.0004473624 * t ** 4 + t ** 5 / 233174;
  }
  if (y < 1920) {
    const t = y - 1900;
    return -2.79 + 1.494119 * t - 0.0598939 * t ** 2 + 0.0061966 * t ** 3 - 0.000197 * t ** 4;
  }
  if (y < 1941) {
    const t = y - 1920;
    return 21.2 + 0.84493 * t - 0.0761 * t ** 2 + 0.0020936 * t ** 3;
  }
  if (y < 1961) {
    const t = y - 1950;
    return 29.07 + 0.407 * t - t ** 2 / 233 + t ** 3 / 2547;
  }
  if (y < 1986) {
    const t = y - 1975;
    return 45.45 + 1.067 * t - t ** 2 / 260 - t ** 3 / 718;
  }
  if (y < 2005) {
    const t = y - 2000;
    return (
      63.86 + 0.3345 * t - 0.060374 * t ** 2 + 0.0017275 * t ** 3 + 0.000651814 * t ** 4 +
      0.00002373599 * t ** 5
    );
  }
  if (y < 2050) {
    const t = y - 2000;
    return 62.92 + 0.32217 * t + 0.005589 * t ** 2;
  }
  if (y < 2150) {
    return -20 + 32 * ((y - 1820) / 100) ** 2 - 0.5628 * (2150 - y);
  }
  const u = (y - 1820) / 100;
  return -20 + 32 * u * u;
}

/** NASA's decimal year for ΔT: year + (month − 0.5) / 12, from a UTC instant. */
export function deltaTDecimalYear(utcMs: number): number {
  const d = new Date(utcMs);
  return d.getUTCFullYear() + (d.getUTCMonth() + 1 - 0.5) / 12;
}

const RAD = Math.PI / 180;

/**
 * Equation of time in minutes (apparent − mean solar time; positive = sundial
 * ahead of the clock), NOAA Solar Calculator algorithm (NOAA ESRL GML
 * "General Solar Position Calculations" / NOAA_Solar_Calculations_day.xls,
 * based on Meeus, Astronomical Algorithms ch. 25/28). Accuracy ≈ ±0.1 min for
 * 1800–2100. Sample values: ≈ −6.0 min mid-July, ≈ +16.4 min early November,
 * ≈ −14.2 min mid-February.
 */
export function equationOfTimeMinutes(jd: number): number {
  const T = (jd - JD_J2000) / 36525;
  const L0 = (((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360) + 360) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const seconds = 21.448 - T * (46.815 + T * (0.00059 - T * 0.001813));
  const eps0 = 23 + (26 + seconds / 60) / 60;
  const omega = 125.04 - 1934.136 * T;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const y = Math.tan((eps * RAD) / 2) ** 2;
  const l0 = L0 * RAD;
  const m = M * RAD;
  const E =
    y * Math.sin(2 * l0) -
    2 * e * Math.sin(m) +
    4 * e * y * Math.sin(m) * Math.cos(2 * l0) -
    0.5 * y * y * Math.sin(4 * l0) -
    1.25 * e * e * Math.sin(2 * m);
  return (4 * E) / RAD;
}
