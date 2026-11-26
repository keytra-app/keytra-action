import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { useAction } from './helpers';

const t = useAction();

describe('push', () => {
  it('pushes a single file into the namespace input', async () => {
    writeFileSync('en.json', '﻿{"a":"A","b":"B"}');
    t.inputs({ 'source-path': 'en.json', namespace: 'web', prune: 'true' });

    await t.run('push');

    expect(t.server.requests).toEqual([
      {
        method: 'POST',
        path: '/api/v1/projects/demo/push',
        query: { namespace: 'web', prune: 'true' },
        body: '{"a":"A","b":"B"}',
      },
    ]);
    expect(JSON.parse(t.outputs()['summary-json']).totals).toEqual({ added: 2, updated: 0, unchanged: 0, pruned: 0 });
    expect(t.summary()).toContain('| Namespace | Added | Updated | Unchanged | Pruned |');
    expect(t.summary()).toContain('| web | 2 | 0 | 0 | 0 |');
  });

  it.each(['locales/en', 'locales/en/', 'locales/en/*.json'])('uses file names as namespaces for %s', async (path) => {
    mkdirSync('locales/en', { recursive: true });
    writeFileSync('locales/en/common.json', '{"a":"A"}');
    writeFileSync('locales/en/auth.json', '{"b":"B"}');
    writeFileSync('locales/en/readme.txt', 'ignored');
    t.inputs({ 'source-path': path, namespace: 'ignored' });

    await t.run('push');

    expect(t.server.requests.map((r) => r.query)).toEqual([
      { namespace: 'auth', prune: 'false' },
      { namespace: 'common', prune: 'false' },
    ]);
  });

  it('sends nothing if any file is invalid', async () => {
    writeFileSync('a.json', '{"a":"A"}');
    writeFileSync('b.json', '{broken');
    t.inputs({ 'source-path': '*.json' });

    await t.run('push');
    expect(t.errors()[0]).toContain('b.json is not valid JSON');
    expect(t.server.requests).toHaveLength(0);
  });

  it('refuses two files with the same namespace', async () => {
    for (const dir of ['x', 'y']) {
      mkdirSync(dir);
      writeFileSync(`${dir}/common.json`, '{}');
    }
    t.inputs({ 'source-path': '*/common.json', prune: 'true' });

    await t.run('push');
    expect(t.errors()[0]).toContain('both map to namespace "common"');
    expect(t.server.requests).toHaveLength(0);
  });

  it('fails if nothing matches', async () => {
    t.inputs({ 'source-path': 'missing/*.json' });
    await t.run('push');
    expect(t.errors()[0]).toContain('No files match');
  });

  it('reports namespaces already pushed when a later one fails', async () => {
    writeFileSync('a.json', '{"a":"A"}');
    writeFileSync('b.json', '{"b":"B"}');
    t.inputs({ 'source-path': '*.json' });
    t.server.state.override = (request, response) => {
      if (request.query.namespace !== 'b') return false;
      response.writeHead(400).end('{"error":"Nope."}');
      return true;
    };

    await t.run('push');
    expect(t.errors()[0]).toContain('HTTP 400 Bad Request: {"error":"Nope."}');
    expect(t.summary()).toContain('| a | 1 |');
  });
});
