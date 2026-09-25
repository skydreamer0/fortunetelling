/**
 * Minimal PWA build step: emits sw.js with a precache list of the production bundle
 * (hashed JS/CSS, index.html) plus the public/ files, versioned by their content.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

const SW_SOURCE = new URL('./sw.js', import.meta.url);
/** Files that should never be precached (source-only or too large to be worth it). */
const SKIP = /(^|\/)(sw\.js|.*\.map)$/;

function listFiles(dir: string, root = dir): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path, root) : [relative(root, path).split(sep).join('/')];
  });
}

export function pwa(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'fortune:pwa',
    apply: 'build',
    enforce: 'post',
    configResolved(resolved) {
      config = resolved;
    },
    generateBundle(_options, bundle) {
      const hash = createHash('sha256');
      const bundled = Object.values(bundle).map(item => {
        hash.update(item.fileName);
        hash.update(item.type === 'chunk' ? item.code : item.source);
        return item.fileName;
      });
      const publicFiles = config.publicDir ? listFiles(config.publicDir) : [];
      for (const file of publicFiles) hash.update(file).update(readFileSync(join(config.publicDir, file)));

      // './' is the start_url; index.html is the same document under its own name.
      const urls = ['./', ...new Set([...bundled, ...publicFiles])]
        .filter(file => !SKIP.test(file))
        .sort();
      const version = hash.digest('hex').slice(0, 12);
      const source = readFileSync(SW_SOURCE, 'utf8')
        .replace('__PWA_VERSION__', JSON.stringify(version))
        .replace('__PWA_PRECACHE__', JSON.stringify(urls, null, 2));
      if (source.includes('__PWA_')) this.error('sw.js still contains an unfilled __PWA_ placeholder');
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}
