// Minimal Keytra API mock for Vitest and the CI self-test (`node test/mock-server.mts <port>`).
import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

export const API_KEY = 'ktr_0123456789abcdef0123456789abcdef';

export type Recorded = { method: string; path: string; query: Record<string, string>; body: string };

/** Return true if the request was handled. */
export type Override = (request: Recorded, response: ServerResponse) => boolean;

export function projectStatus(complete = false) {
  const locale = (code: string, name: string, translated: number, outdated: number) => ({
    code,
    name,
    total: 2,
    translated,
    outdated,
    missing: 2 - translated - outdated,
    percentage: translated * 50,
  });
  return {
    slug: 'demo',
    sourceLocale: 'en',
    totalKeys: 2,
    locales: [locale('de', 'German', 2, 0), complete ? locale('fr', 'French', 2, 0) : locale('fr', 'French', 1, 0)],
  };
}

export async function startMockServer(port = 0) {
  const requests: Recorded[] = [];
  const state: { complete: boolean; override?: Override } = { complete: false };

  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const url = new URL(req.url ?? '/', 'http://localhost');
    const recorded: Recorded = {
      method: req.method ?? '',
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      body: Buffer.concat(chunks).toString('utf8'),
    };
    requests.push(recorded);

    const json = (status: number, data: unknown) =>
      res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(data));

    if (req.headers.authorization !== `Bearer ${API_KEY}`) return json(401, { error: 'Invalid or missing API key.' });
    if (state.override?.(recorded, res)) return;

    const [, action, locale] =
      url.pathname.match(/^\/api\/v1\/projects\/demo\/(push|pull|status)(?:\/([^/]+))?$/) ?? [];
    if (action === 'push' && req.method === 'POST') {
      const added = Object.keys(JSON.parse(recorded.body)).length;
      return json(200, { added, updated: 0, unchanged: 0, pruned: 0 });
    }
    if (action === 'pull' && locale) {
      const namespace = recorded.query.namespace;
      return json(200, { greeting: { hello: `hello ${locale} ${namespace}` } });
    }
    if (action === 'status') return json(200, projectStatus(state.complete));
    return json(404, { error: 'Not found.' });
  });

  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    requests,
    state,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { url } = await startMockServer(Number(process.argv[2] ?? 4010));
  console.log(`Keytra mock listening on ${url}`);
}
