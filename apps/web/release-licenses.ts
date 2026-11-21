import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

// SHA-256 of swisseph.wasm in the integrity-checked @swisseph/browser@1.3.1 archive.
// See the npm provenance and exact corresponding upstream source in THIRD-PARTY-NOTICES.md.
export const SWISS_WASM_SHA256 = 'c73d47b63f9879fafc99171fe1cf484b7f2dda214c0fd7d5299bad8542d56968';
export const WEB_LICENSES_FILE = 'WEB-DEPENDENCY-LICENSES.txt';
const FIRST_PARTY = new Set(['@fortune/ai', '@fortune/core', '@fortune/mcp', '@fortune/web']);

export function assertSwissWasm(wasmFiles: readonly Uint8Array[]): void {
  if (wasmFiles.length !== 1 || createHash('sha256').update(wasmFiles[0]!).digest('hex') !== SWISS_WASM_SHA256) {
    throw new Error('Built Swiss Ephemeris WASM is absent, duplicated, or differs from the pinned npm artifact.');
  }
}

/** Module IDs are from the actual bundler output, not the set of installed dev dependencies. */
export function bundledPackageDirectory(rawId: string): { name: string; directory: string } | null {
  const id = rawId.replace(/^\0/, '').replaceAll('\\', '/').split('?')[0]!;
  const marker = '/node_modules/';
  const start = id.lastIndexOf(marker);
  if (start < 0) return null;
  const key = id.slice(start + marker.length).match(/^((?:@[^/]+\/)?[a-z0-9][a-z0-9._-]*)(?=\/)/i);
  if (!key || FIRST_PARTY.has(key[1]!)) return null;
  return { name: key[1]!, directory: id.slice(0, start + marker.length) + key[1] };
}

export function bundledLicenses(moduleIds: Iterable<string>): string {
  const packages = new Map<string, string>();
  const directories = new Set<string>();
  for (const id of moduleIds) {
    const pkg = bundledPackageDirectory(id);
    if (!pkg || directories.has(pkg.directory)) continue;
    directories.add(pkg.directory);
    const descriptor = JSON.parse(readFileSync(join(pkg.directory, 'package.json'), 'utf8'));
    if (descriptor.name !== pkg.name || typeof descriptor.version !== 'string') {
      throw new Error(`Unexpected package identity while collecting notices: ${pkg.name}`);
    }
    const files = readdirSync(pkg.directory, { withFileTypes: true })
      .filter(file => file.isFile() && /^(?:licen[cs]es?|copying|copyright|notices?)(?:[-._].*)?$/i.test(file.name))
      .map(file => file.name).sort();
    const license = typeof descriptor.license === 'string' ? descriptor.license : '(see included terms)';
    if (!files.some(file => /^(?:licen[cs]es?|copying)(?:[-._].*)?$/i.test(file))) {
      throw new Error(`Installed bundled package has no standalone license text: ${pkg.name}@${descriptor.version}`);
    }
    const heading = `${pkg.name}@${descriptor.version}`;
    const section = `${heading} [${license}]\n\n${files.map(file => `--- ${file} ---\n${readFileSync(join(pkg.directory, file), 'utf8')}`).join('\n\n')}`;
    const previous = packages.get(heading);
    if (previous && previous !== section) throw new Error(`Conflicting notices for ${heading}`);
    packages.set(heading, section);
  }
  if (!packages.size) throw new Error('No third-party licensing files found for the built web modules.');
  return 'License texts for installed third-party packages bundled into this web build.\n'
    + 'See THIRD-PARTY-NOTICES.txt for corresponding source and separate third-party content.\n\n'
    + [...packages.keys()].sort().map(heading => packages.get(heading)).join('\n\n') + '\n';
}

export function releaseLicenses(): Plugin {
  return {
    name: 'fortune:release-licenses',
    apply: 'build',
    generateBundle(_options, bundle) {
      const outputs = Object.values(bundle);
      const ids = outputs.flatMap(item => item.type === 'chunk' ? Object.keys(item.modules) : []);
      const wasm = outputs.flatMap(item => item.type === 'asset' && /^assets\/swisseph-[\w-]+\.wasm$/.test(item.fileName)
        && typeof item.source !== 'string' ? [item.source] : []);
      assertSwissWasm(wasm);
      // The pinned browser package distributes a pre-bundled wrapper with core sources;
      // Rolldown also emits browser helpers with virtual module IDs rather than physical paths.
      const embedded = ['@swisseph/browser', '@swisseph/core'];
      if (ids.some(id => id.startsWith('\0vite/'))) embedded.push('vite');
      if (ids.some(id => id.startsWith('\0rolldown/'))) embedded.push('rolldown');
      const bundledIds = [...ids, ...embedded.map(name => join(
        fileURLToPath(new URL('../../node_modules/', import.meta.url)), name, 'package.json',
      ))];
      this.emitFile({ type: 'asset', fileName: WEB_LICENSES_FILE, source: bundledLicenses(bundledIds) });
      for (const [repoPath, fileName] of [['LICENSE', 'LICENSE.txt'], ['THIRD-PARTY-NOTICES.md', 'THIRD-PARTY-NOTICES.txt']]) {
        const source = readFileSync(new URL(`../../${repoPath}`, import.meta.url));
        this.emitFile({ type: 'asset', fileName, source });
      }
    },
  };
}
