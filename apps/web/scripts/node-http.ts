import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { spawnSync } from 'node:child_process';

/** Loopback-only fixture host for browser acceptance checks. */
export async function serveFixture(options: {
  hostname: '127.0.0.1'; port: number;
  fetch(request: Request): Response | Promise<Response>;
}) {
  const server = createServer(async (incoming, outgoing) => {
    try {
      const request = new Request(`http://${incoming.headers.host}${incoming.url}`, { method: incoming.method });
      const response = await options.fetch(request);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      outgoing.writeHead(500); outgoing.end('fixture server error');
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.hostname, () => { server.off('error', reject); resolve(); });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP fixture address');
  return { port: address.port, stop(force = false): Promise<void> {
    return new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      if (force) server.closeAllConnections();
    });
  } };
}

export async function fileResponse(path: string): Promise<Response> {
  const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff': 'font/woff', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp' };
  try {
    return new Response(await readFile(path), { headers: { 'Cache-Control': 'no-store', 'Content-Type': types[extname(path)] ?? 'application/octet-stream' } });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Response('not found', { status: 404 });
    throw error;
  }
}

export function runCommand(args: string[]) {
  const result = spawnSync(args[0]!, args.slice(1));
  if (result.error) throw result.error;
  return { ...result, exitCode: result.status };
}
