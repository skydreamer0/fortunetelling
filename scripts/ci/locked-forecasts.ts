/**
 * Append-only guard for locked forecasts (#61, bounded slice).
 *
 * 1. Every file directly under forecasts/locked/ (except README.md) must be a
 *    `<forecastId>.json` locked forecast that matches the v1 schema below and
 *    its own contentSha256.
 * 2. Relative to the merge base, the only allowed status touching
 *    forecasts/locked/ is A (added). M, D, R, C, T and anything else fail,
 *    including README.md.
 *
 * This checks repository history only. It is not a trusted timestamp and does
 * not reproduce a forecast from its recorded spec (see
 * docs/validation/locked-forecasts-61.md).
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const LOCKED_DIR = 'forecasts/locked';
export const README = `${LOCKED_DIR}/README.md`;
export const SCHEMA_VERSION = 1;

/** Locked forecast v1. All fields are required unless marked optional; unknown keys are rejected. */
export interface LockedForecastV1 {
  schemaVersion: 1;
  /** Lowercase id; the file must be named `<forecastId>.json`. */
  forecastId: string;
  /** UTC instant the forecast was locked, `YYYY-MM-DDTHH:MM:SSZ`. */
  issuedAt: string;
  /** Latest UTC instant of data available to the forecast; must not be after issuedAt. */
  dataCutoff: string;
  targetEvent: { domain: string; proposition: string };
  direction: 'positive' | 'negative';
  /** Inclusive calendar-date window, `YYYY-MM-DD`. */
  window: { start: string; end: string };
  outcomeDefinitions: { hit: string; miss: string; undecidable: string };
  calculation: { specHash: string; snapshotId: string };
  versions: { core: string; rules: string; catalog: string; aggregation: string };
  /** Optional: forecastId of an earlier locked forecast this one corrects. The earlier file stays. */
  supersedes?: string;
  /** SHA-256 hex of canonicalJson(payload without contentSha256). */
  contentSha256: string;
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite number cannot be canonicalised');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.keys(value as object).sort().map(key => {
      const item = (value as Record<string, unknown>)[key];
      if (item === undefined) throw new Error(`Undefined value at key ${key}`);
      return `${JSON.stringify(key)}:${canonicalJson(item)}`;
    });
    return `{${entries.join(',')}}`;
  }
  throw new Error(`Unsupported JSON value: ${typeof value}`);
}

export function contentSha256(forecast: Record<string, unknown>): string {
  const { contentSha256: _omitted, ...payload } = forecast;
  return createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex');
}

const ID = /^[a-z0-9][a-z0-9-]{0,127}$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
const validInstant = (value: unknown) => typeof value === 'string' && INSTANT.test(value) && new Date(value).toISOString() === value.replace('Z', '.000Z');
const validDate = (value: unknown) => typeof value === 'string' && DATE.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

/** Returns schema errors; an empty list means the value is a structurally valid LockedForecastV1. */
export function schemaErrors(value: unknown): string[] {
  if (!isObject(value)) return ['top level must be a JSON object'];
  const errors: string[] = [];
  const exact = (object: Record<string, unknown>, where: string, required: string[], optional: string[] = []) => {
    for (const key of required) if (!(key in object)) errors.push(`${where}missing field ${key}`);
    for (const key of Object.keys(object)) if (!required.includes(key) && !optional.includes(key)) errors.push(`${where}unknown field ${key}`);
  };
  const nested = (key: string, fields: string[], check: (v: unknown) => boolean, rule: string) => {
    const object = value[key];
    if (!isObject(object)) { if (key in value) errors.push(`${key} must be an object`); return undefined; }
    exact(object, `${key}.`, fields);
    for (const field of fields) if (field in object && !check(object[field])) errors.push(`${key}.${field} must be ${rule}`);
    return object;
  };
  exact(value, '', ['schemaVersion', 'forecastId', 'issuedAt', 'dataCutoff', 'targetEvent', 'direction', 'window',
    'outcomeDefinitions', 'calculation', 'versions', 'contentSha256'], ['supersedes']);
  if ('schemaVersion' in value && value.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must be ${SCHEMA_VERSION}`);
  if ('forecastId' in value && !(typeof value.forecastId === 'string' && ID.test(value.forecastId))) errors.push('forecastId must match ^[a-z0-9][a-z0-9-]{0,127}$');
  for (const key of ['issuedAt', 'dataCutoff']) if (key in value && !validInstant(value[key])) errors.push(`${key} must be a valid UTC instant YYYY-MM-DDTHH:MM:SSZ`);
  if (validInstant(value.issuedAt) && validInstant(value.dataCutoff) && (value.dataCutoff as string) > (value.issuedAt as string)) errors.push('dataCutoff must not be after issuedAt');
  nested('targetEvent', ['domain', 'proposition'], text, 'a non-empty string');
  if ('direction' in value && value.direction !== 'positive' && value.direction !== 'negative') errors.push('direction must be "positive" or "negative"');
  const window = nested('window', ['start', 'end'], validDate, 'a valid date YYYY-MM-DD');
  if (window && validDate(window.start) && validDate(window.end) && (window.start as string) > (window.end as string)) errors.push('window.start must not be after window.end');
  nested('outcomeDefinitions', ['hit', 'miss', 'undecidable'], text, 'a non-empty string');
  nested('calculation', ['specHash', 'snapshotId'], text, 'a non-empty string');
  nested('versions', ['core', 'rules', 'catalog', 'aggregation'], text, 'a non-empty string');
  if ('supersedes' in value && !(typeof value.supersedes === 'string' && ID.test(value.supersedes) && value.supersedes !== value.forecastId)) errors.push('supersedes must be another valid forecastId');
  if ('contentSha256' in value && !(typeof value.contentSha256 === 'string' && HEX64.test(value.contentSha256))) errors.push('contentSha256 must be 64 lowercase hex characters');
  return errors;
}

/** Validates one file's name and bytes. Returns prefixed error messages. */
export function validateForecastFile(fileName: string, raw: string): string[] {
  const where = `${LOCKED_DIR}/${fileName}`;
  if (!/\.json$/.test(fileName)) return [`${where}: only <forecastId>.json files (and README.md) are allowed in ${LOCKED_DIR}/`];
  let value: unknown;
  try { value = JSON.parse(raw.replace(/^﻿/, '')); } catch (error) { return [`${where}: invalid JSON (${(error as Error).message})`]; }
  const errors = schemaErrors(value).map(message => `${where}: schema: ${message}`);
  if (errors.length) return errors;
  const forecast = value as unknown as LockedForecastV1;
  if (fileName !== `${forecast.forecastId}.json`) errors.push(`${where}: file name must be ${forecast.forecastId}.json`);
  const actual = contentSha256(value as Record<string, unknown>);
  if (actual !== forecast.contentSha256) errors.push(`${where}: contentSha256 mismatch (recorded ${forecast.contentSha256}, computed ${actual})`);
  return errors;
}

/** Validates the working-tree directory contents. A missing directory is an error. */
export function validateDirectory(root: string): string[] {
  const directory = join(root, LOCKED_DIR);
  if (!existsSync(directory) || !lstatSync(directory).isDirectory()) return [`${LOCKED_DIR}/ is missing`];
  const errors: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile()) { errors.push(`${LOCKED_DIR}/${entry.name}: only regular files are allowed (no directories or links)`); continue; }
    if (entry.name === 'README.md') continue;
    errors.push(...validateForecastFile(entry.name, readFileSync(join(directory, entry.name), 'utf8')));
  }
  return errors;
}

export interface NameStatus { status: string; paths: string[] }

/** Parses `git diff --name-status -z` output, including R/C entries with a score and two paths. */
export function parseNameStatus(raw: string): NameStatus[] {
  if (!raw) return [];
  const parts = raw.split('\0');
  if (parts.pop() !== '') throw new Error('Incomplete NUL-delimited diff');
  const changes: NameStatus[] = [];
  for (let i = 0; i < parts.length;) {
    const status = parts[i++]!;
    if (!/^([AMDTUXB]|[RC]\d{0,3})$/.test(status)) throw new Error(`Invalid diff status ${JSON.stringify(status)}`);
    const count = /^[RC]/.test(status) ? 2 : 1;
    const paths = parts.slice(i, i + count);
    i += count;
    if (paths.length !== count || paths.some(path => !path || path.startsWith('/') || path.split('/').includes('..'))) throw new Error('Invalid diff entry');
    changes.push({ status, paths });
  }
  return changes;
}

const locked = (path: string) => path === LOCKED_DIR || path.startsWith(`${LOCKED_DIR}/`);
const describe: Record<string, string> = { M: 'modified', D: 'deleted', R: 'renamed', C: 'copied', T: 'type-changed' };

/** Only additions may touch forecasts/locked/. Returns one error per offending entry. */
export function appendOnlyErrors(changes: NameStatus[]): string[] {
  return changes.filter(change => change.paths.some(locked) && change.status !== 'A').map(change => {
    const kind = describe[change.status[0]!] ?? `status ${change.status}`;
    return `${change.paths.join(' -> ')}: ${kind}. Locked forecasts are append-only: never edit, delete, rename or copy over them; add a new forecast with "supersedes" instead.`;
  });
}

function git(cwd: string, ...args: string[]): string {
  const child = spawnSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  if (child.status !== 0) throw new Error(`git ${args[0]} failed: ${child.stderr.toString().trim()}`);
  return child.stdout.toString();
}

/** Whole-tree diff from the merge base with explicit rename/copy detection; filtering happens in code. */
export function diffFromMergeBase(cwd: string, base: string, head = 'HEAD'): NameStatus[] {
  const mergeBase = git(cwd, 'merge-base', base, head).trim();
  return parseNameStatus(git(cwd, '-c', 'core.quotepath=false', 'diff', '--name-status', '-z', '-M', '-C', '--no-ext-diff', mergeBase, head));
}

/** Resolves the comparison base from the GitHub event. `null` means content-only (manual dispatch). Fails closed otherwise. */
export function resolveBase(
  eventName: string | undefined,
  event: { pull_request?: { base?: { sha?: unknown } }; before?: unknown } | undefined,
): string | null {
  const sha = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value) && !/^0+$/.test(value);
  if (eventName === 'pull_request') {
    const base = event?.pull_request?.base?.sha;
    if (!sha(base)) throw new Error('pull_request event without a valid base SHA');
    return base;
  }
  if (eventName === 'push') {
    if (!sha(event?.before)) throw new Error('push event without a usable "before" SHA (new branch or force push); refusing to skip the append-only check');
    return event!.before as string;
  }
  if (eventName === 'workflow_dispatch') return null;
  throw new Error(`Unsupported event ${JSON.stringify(eventName)} for the locked forecast guard`);
}

export function check(cwd: string, base: string | null): string[] {
  const errors = validateDirectory(cwd);
  if (base !== null) errors.push(...appendOnlyErrors(diffFromMergeBase(cwd, base)));
  return errors;
}

if (import.meta.main) {
  const eventName = process.env.GITHUB_EVENT_NAME;
  const event = process.env.GITHUB_EVENT_PATH ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')) : undefined;
  const base = resolveBase(eventName, event);
  if (base === null) console.log(`${eventName}: no comparison base; validating ${LOCKED_DIR}/ contents only (append-only history check not applied).`);
  const errors = check(process.cwd(), base);
  if (errors.length) {
    for (const error of errors) console.error(`::error::${error}`);
    process.exit(1);
  }
  console.log(`Locked forecasts OK${base ? ` (append-only relative to merge base with ${base})` : ' (contents only)'}.`);
}
