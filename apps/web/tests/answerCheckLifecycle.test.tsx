import { expect, test } from 'bun:test';
import { createRequire } from 'node:module';
import { isValidElement, type ReactNode } from 'react';

const require = createRequire(import.meta.url);
async function harness() {
  const slots: any[] = []; const effects: { deps: unknown[]; cleanup?: () => void }[] = [];
  let cursor = 0, ec = 0, report: any = { name: 'first' }, tree: any;
  const pendingEffects: (() => void)[] = [];
  const jobs: { resolve: () => void; reject: (e: Error) => void; signal: AbortSignal }[] = [];
  let failInit = false, checks = 0;
  const react = {
    ...require('react'),
    useState(initial: any) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (v: any) => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(initial: any) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useEffect(fn: () => (() => void), deps: unknown[]) { const i = ec++; if (!effects[i] || deps.some((x, j) => x !== effects[i].deps[j])) pendingEffects.push(() => { effects[i]?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; }); },
  };
  const lookup = Object.assign(() => null, {
    prepare(_ids: string[], signal: AbortSignal) { return new Promise<void>((resolve, reject) => jobs.push({ resolve, reject, signal })); },
    directionalEvidence() { return []; },
  });
  const mod: any = { exports: {} };
  const build = await Bun.build({ entrypoints: ['apps/web/src/components/report/AnswerCheck.tsx'], target: 'bun', format: 'cjs', external: ['*'] });
  if (!build.success) throw new Error(build.logs.join('\n'));
  const compiled = await build.outputs[0].text();
  const load = (id: string) => id === 'react' ? react : id === '../../model/askAi' ? {
    reportSignalLookup() { if (failInit) throw new Error('synthetic initialization failure'); return lookup; },
  } : id === '@fortune/ai/mcp' ? { checkAnswer(text: string, options: any) {
    if (options.directionalEvidence) checks++;
    return { ok: true, paragraphCount: 1, citedIds: [text], unknownCitations: [], issues: [] };
  } } : require(id);
  new Function(`return (\n${compiled}\n)` )()(mod.exports, load, mod, 'AnswerCheck.tsx', '.');
  function render() { cursor = 0; ec = 0; tree = mod.exports.AnswerCheck({ report }); pendingEffects.splice(0).forEach(fn => fn()); }
  function walk(n: ReactNode): any[] { if (Array.isArray(n)) return n.flatMap(x => walk(x)); if (!isValidElement<any>(n)) return []; return [n, ...walk((n.props as { children?: ReactNode }).children)]; }
  function nodes() { return walk(tree); }
  render(); render();
  return {
    jobs, render, nodes,
    change(text: string) { nodes().find(n => n.type === 'textarea').props.onChange({ target: { value: text } }); render(); },
    run() { return nodes().find(n => n.type === 'button').props.onClick() as Promise<void>; },
    busy() { render(); return Boolean(nodes().find(n => n.props.role === 'status')); },
    results() { render(); return nodes().filter(n => n.type === mod.exports.AnswerCheckView); },
    setReport(value: object) { report = value; render(); render(); },
    unmount() { effects.forEach(e => e.cleanup?.()); },
    failInit(value: boolean) { failInit = value; },
    checkCount() { return checks; },
  };
}

test('A → B → A and stale success/finally cannot replace a newer busy result', async () => {
  const h = await harness(); h.change('A'); const old = h.run(); h.render();
  h.change('B'); h.change('A'); const fresh = h.run(); h.render();
  expect(h.jobs).toHaveLength(2); expect(h.jobs[0].signal.aborted).toBe(true);
  h.jobs[0].resolve(); await old;
  expect(h.busy()).toBe(true); expect(h.results()).toHaveLength(0); expect(h.checkCount()).toBe(0);
  h.jobs[1].resolve(); await fresh;
  expect(h.busy()).toBe(false); expect(h.results()).toHaveLength(1); expect(h.checkCount()).toBe(1);
});

test('stale failure does not clear a newer request; repeated click starts one job', async () => {
  const h = await harness(); h.change('A'); const old = h.run(); await h.run(); expect(h.jobs).toHaveLength(1);
  h.change('B'); const fresh = h.run(); h.jobs[0].reject(new Error('late failure')); await old;
  expect(h.busy()).toBe(true); expect(h.nodes().some(n => n.props.role === 'alert')).toBe(false);
  h.jobs[1].resolve(); await fresh; expect(h.results()).toHaveLength(1);
});

test('report change and unmount cancel old work before answer checking', async () => {
  const h = await harness(); h.change('A'); const old = h.run(); h.setReport({ name: 'second' });
  h.jobs[0].resolve(); await old; expect(h.results()).toHaveLength(0); expect(h.checkCount()).toBe(0);
  const fresh = h.run(); h.unmount(); h.jobs[1].resolve(); await fresh;
  expect(h.checkCount()).toBe(0); expect(h.jobs[1].signal.aborted).toBe(true);
});

test('lookup initialization failure releases the gate and permits retry', async () => {
  const h = await harness(); h.change('A'); h.failInit(true); await h.run();
  expect(h.busy()).toBe(false); expect(h.nodes().some(n => n.props.role === 'alert')).toBe(true);
  h.failInit(false); const retry = h.run(); expect(h.jobs).toHaveLength(1);
  h.jobs[0].resolve(); await retry; expect(h.results()).toHaveLength(1);
});
