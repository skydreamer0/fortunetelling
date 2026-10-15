import { build } from 'esbuild';
import { readFile, rm, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const entries = Object.keys(pkg.exports).map(key => key === '.' ? 'src/index.ts' : `src/${key.slice(2)}.ts`);
if (pkg.name === '@fortune/mcp') entries.push('src/bin.ts', 'src/cli/doctor.ts', 'src/cli/addProfile.ts', 'src/cli/exportBundle.ts');
await rm('dist', { recursive: true, force: true });
const types = spawnSync(process.execPath, [join(dirname(require.resolve('typescript/package.json')), 'bin', 'tsc'), '-p', 'tsconfig.build.json'], { stdio: 'inherit' });
if (types.status !== 0) process.exit(types.status ?? 1);
// NodeNext consumers require explicit extensions in declaration imports too.
async function fixDeclarations(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) { await fixDeclarations(file); continue; }
    if (!file.endsWith('.d.ts')) continue;
    const source = await readFile(file, 'utf8');
    const fixed = source.replace(/((?:from\s+|import\s*\()\s*['"])(\.[^'"]+)(['"])/g, (match, before, specifier, after) => {
      const target = resolve(dirname(file), specifier);
      if (existsSync(`${target}.d.ts`)) return `${before}${specifier}.js${after}`;
      if (existsSync(join(target, 'index.d.ts'))) return `${before}${specifier}/index.js${after}`;
      return match;
    });
    await writeFile(file, fixed);
  }
}
await fixDeclarations('dist');
await build({
  entryPoints: entries, outdir: 'dist', outbase: 'src', bundle: true,
  format: 'esm', platform: 'neutral', target: 'es2022', packages: 'external',
  splitting: true, sourcemap: true, mainFields: ['module', 'main'],
});
