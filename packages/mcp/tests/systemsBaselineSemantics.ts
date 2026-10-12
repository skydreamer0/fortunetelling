import { isDeepStrictEqual } from 'node:util';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Test-only attribution of a raw, parsed successful MCP response. No legacy omissions,
 * ID expansion, year removal, generatedAt removal or version substitution belongs here.
 * In particular, systemsUsed / experimentalSensitivity are DATA, not envelope metadata.
 * Keep unknown envelope fields: a future field must not silently disappear from review.
 */
export function projectSystemsBaseline(response: unknown) {
  if (!isRecord(response) || 'error' in response || !Object.hasOwn(response, 'data') ||
      !Object.hasOwn(response, 'asOf') ||
      (response.asOf !== null && typeof response.asOf !== 'string') ||
      typeof response.versionsHash !== 'string' || !Array.isArray(response.caveats)) {
    throw new TypeError('Expected a parsed successful MCP envelope for baseline attribution');
  }
  const { data, caveats, versionsHash, versions, ...envelope } = response;
  return {
    data,
    caveats,
    versions: { versionsHash, ...(Object.hasOwn(response, 'versions') ? { versions } : {}) },
    envelope,
  };
}

/**
 * Classify locations of differences, never their acceptability or calculation cause.
 * data-change includes text/format changes inside data and requires further attribution.
 * This is supplementary to the preserved legacy digest assertions, not a replacement.
 */
export function classifySystemsBaselineChange(before: unknown, after: unknown) {
  const a = projectSystemsBaseline(before);
  const b = projectSystemsBaseline(after);
  const changed = {
    data: !isDeepStrictEqual(a.data, b.data),
    caveats: !isDeepStrictEqual(a.caveats, b.caveats),
    versions: !isDeepStrictEqual(a.versions, b.versions),
    envelope: !isDeepStrictEqual(a.envelope, b.envelope),
  };
  const kind = changed.data ? 'data-change'
    : changed.envelope ? 'envelope-change'
    : changed.caveats && changed.versions ? 'caveats-and-versions'
    : changed.caveats ? 'caveats-only'
    : changed.versions ? 'versions-only'
    : 'unchanged';
  return { kind, changed };
}
