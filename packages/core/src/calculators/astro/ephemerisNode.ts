import type { SwissEphemeris } from '@swisseph/browser';

/** Node-only adapter for the pinned browser binding's local WASM assets.
 * The binding's init() only fetches URLs and logs to stdout. Instantiate the
 * same module from disk instead; no fetch shim, network or global log patch.
 * Internal binding fields are pinned to @swisseph/browser 1.3.1 and covered by
 * the built-package/offline WASM integration test.
 */
export async function initNodeEphemeris(instance: SwissEphemeris): Promise<void> {
  const fsName = 'node:fs/promises';
  const moduleName = 'node:module';
  const urlName = 'node:url';
  const { readFile } = await import(/* @vite-ignore */ fsName) as typeof import('node:fs/promises');
  const { createRequire } = await import(/* @vite-ignore */ moduleName) as typeof import('node:module');
  const require = createRequire(import.meta.url);
  const { pathToFileURL } = await import(/* @vite-ignore */ urlName) as typeof import('node:url');
  const bindingUrl = pathToFileURL(require.resolve('@swisseph/browser'));
  const factoryUrl = new URL('./swisseph.js', bindingUrl).href;
  const { default: factory } = await import(/* @vite-ignore */ factoryUrl);
  const bytes = await readFile(new URL('./swisseph.wasm', bindingUrl));
  const compiled = await WebAssembly.compile(bytes);
  const module = await factory({
    print: (text: string) => console.error(text),
    printErr: (text: string) => console.error(text),
    instantiateWasm(imports: WebAssembly.Imports, receive: (instance: WebAssembly.Instance) => void) {
      const wasm = new WebAssembly.Instance(compiled, imports);
      receive(wasm);
      return wasm.exports;
    },
  });
  const binding = instance as unknown as { module: unknown; ready: boolean; _wrapFunctions(): void };
  binding.module = module;
  binding._wrapFunctions();
  binding.ready = true;
}
