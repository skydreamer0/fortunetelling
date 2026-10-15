import { expect, test } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { serveFixture, fileResponse, runCommand } from '../scripts/node-http';

test('Node loopback fixture serves real Request/Response status, headers and binary bytes, then stops', async () => {
  const received: string[] = [];
  const server = await serveFixture({ hostname: '127.0.0.1', port: 0, fetch: request => {
    received.push(`${request.method} ${new URL(request.url).pathname}`);
    return new Response(new Uint8Array([0, 255, 23]), { status: 201, headers: { 'Content-Type': 'application/octet-stream', 'X-Fixture': 'synthetic' } });
  } });
  const url = `http://127.0.0.1:${server.port}/synthetic`;
  try {
    const response = await fetch(url);
    expect(response.status).toBe(201);
    expect(response.headers.get('x-fixture')).toBe('synthetic');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([0, 255, 23]);
    expect(received).toEqual(['GET /synthetic']);
  } finally { await server.stop(true); }
  await expect(fetch(url)).rejects.toThrow();
});

test('fixture callback failures become bounded 500 responses and graceful stop completes', async () => {
  const server = await serveFixture({ hostname: '127.0.0.1', port: 0, fetch: () => { throw new Error('synthetic private detail'); } });
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}/`);
    expect(response.status).toBe(500);
    expect(await response.text()).toBe('fixture server error');
  } finally { await server.stop(); }
});

test('file responses preserve bytes, explicit browser MIME types, no-store and missing-file 404', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fortune-node-http-'));
  try {
    for (const [extension, mime] of Object.entries({ html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', wasm: 'application/wasm', svg: 'image/svg+xml', woff2: 'font/woff2', png: 'image/png', webp: 'image/webp', webmanifest: 'application/manifest+json', ico: 'image/x-icon', jpg: 'image/jpeg', jpeg: 'image/jpeg', woff: 'font/woff', unknown: 'application/octet-stream' })) {
      const path = join(directory, `synthetic.${extension}`);
      await writeFile(path, new Uint8Array([0, 1, 255]));
      const response = await fileResponse(path);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe(mime);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([0, 1, 255]);
    }
    const missing = await fileResponse(join(directory, 'missing.js'));
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe('not found');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('command helper preserves normal failures and rejects spawn failures', () => {
  const success = runCommand([process.execPath, '-e', 'process.stdout.write("synthetic")']);
  expect(success.exitCode).toBe(0);
  expect(success.stdout.toString()).toBe('synthetic');
  const failure = runCommand([process.execPath, '-e', 'process.exitCode = 7']);
  expect(failure.exitCode).toBe(7);
  expect(() => runCommand(['fortune-nonexistent-synthetic-executable'])).toThrow();
});
