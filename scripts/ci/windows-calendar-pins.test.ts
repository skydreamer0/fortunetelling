import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// Portable preflight for the unchanged native Windows provenance gate.
// A source edit requires an explicitly reviewed pin, never a runtime auto-refresh.
test('all six Windows source pins match the checked-in suites and retain the exact test inventory', () => {
  const source = readFileSync(new URL('./windows-calendar.ts', import.meta.url), 'utf8');
  const pins = [...source.matchAll(/\['(\w+)', (\d+), '([a-f0-9]{40})'\]/g)];
  expect(pins.map(([, name, count]) => [name, Number(count)])).toEqual([
    ['baziNatalBasis', 14], ['calculationSpec', 19], ['calendarHostTimezone', 7],
    ['dateOnlyCalendar', 8], ['ziweiAsOfTimezone', 5], ['subprocessModuleUrl', 2],
  ]);
  const blob = (bytes: Buffer) => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  for (const [, name, , expected] of pins) {
    const bytes = readFileSync(new URL(`../../packages/core/tests/${name}.test.ts`, import.meta.url));
    expect(blob(bytes), name).toBe(expected);
    expect(blob(Buffer.concat([bytes, Buffer.from('\n// unreviewed mutation\n')])), name).not.toBe(expected);
  }
  expect(source).toContain('blob === expectedBlob && workingBlob === expectedBlob');
});
