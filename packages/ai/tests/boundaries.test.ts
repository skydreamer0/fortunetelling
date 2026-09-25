/**
 * D-021: `packages/ai` must not import calculators, engines or 命理 libraries.
 * Runtime imports from core are allowed only through src/core-pure.ts, and only
 * of the pure questions engine and HonestyGuard. Everything else: `import type`.
 */
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(import.meta.dir, '..', 'src');
const files = readdirSync(SRC).filter((f) => f.endsWith('.ts'));

function imports(source: string): Array<{ spec: string; typeOnly: boolean }> {
  const out: Array<{ spec: string; typeOnly: boolean }> = [];
  const re = /^\s*(import|export)\s+(type\s+)?[^'"]*?from\s+['"]([^'"]+)['"]/gm;
  for (const m of source.matchAll(re)) out.push({ spec: m[3], typeOnly: Boolean(m[2]) });
  for (const m of source.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push({ spec: m[1], typeOnly: false });
  return out;
}

const FORBIDDEN = [/calculators/, /engines/, /iztro/, /lunar-javascript/, /swisseph/, /\/time\//, /\/rules\//, /\/timeline\//];
const ALLOWED_CORE_RUNTIME = new Set(['../../core/src/questions/engine', '../../core/src/analysis/HonestyGuard.js']);

describe('import boundaries (D-021)', () => {
  test('no calculator / engine / 命理 library imports anywhere in src', () => {
    for (const f of files) {
      for (const { spec } of imports(readFileSync(join(SRC, f), 'utf8'))) {
        for (const re of FORBIDDEN) expect({ file: f, spec, bad: re.test(spec) }).toEqual({ file: f, spec, bad: false });
      }
    }
  });

  test('@fortune/core is imported for types only; runtime core access only via core-pure.ts', () => {
    for (const f of files) {
      for (const { spec, typeOnly } of imports(readFileSync(join(SRC, f), 'utf8'))) {
        if (spec === '@fortune/core') expect({ f, typeOnly }).toEqual({ f, typeOnly: true });
        if (spec.includes('core/src')) {
          expect(f).toBe('core-pure.ts');
          expect(ALLOWED_CORE_RUNTIME.has(spec)).toBe(true);
        }
      }
    }
  });

  test('the pure core modules themselves do not pull calculators', () => {
    const coreSrc = join(SRC, '..', '..', 'core', 'src');
    const seen = new Set<string>();
    const queue = ['questions/engine.ts', 'analysis/HonestyGuard.js'];
    while (queue.length) {
      const rel = queue.shift()!;
      if (seen.has(rel)) continue;
      seen.add(rel);
      const src = readFileSync(join(coreSrc, rel), 'utf8');
      for (const { spec, typeOnly } of imports(src)) {
        if (typeOnly || !spec.startsWith('.')) {
          if (!typeOnly) expect(spec.endsWith('.json')).toBe(true);
          continue;
        }
        const dir = rel.split('/').slice(0, -1).join('/');
        let next = join(dir, spec).replace(/\\/g, '/');
        if (next.endsWith('.json')) continue;
        if (!/\.(ts|js)$/.test(next)) next += '.ts';
        for (const re of FORBIDDEN) expect({ next, bad: re.test(next) }).toEqual({ next, bad: false });
        queue.push(next);
      }
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});
