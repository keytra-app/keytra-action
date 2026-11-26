import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { useAction } from './helpers';

const t = useAction();
const expected = (locale: string, namespace = 'default') =>
  `{\n  "greeting": {\n    "hello": "hello ${locale} ${namespace}"\n  }\n}\n`;

describe('pull', () => {
  it('pulls all target locales and detects changes', async () => {
    await t.run('pull');

    expect(t.server.requests.map((r) => r.path.split('/demo/')[1])).toEqual(['status', 'pull/de', 'pull/fr']);
    expect(t.server.requests[1].query).toEqual({ namespace: 'default', format: 'nested', fallback: 'source' });
    expect(readFileSync('locales/de.json', 'utf8')).toBe(expected('de'));
    expect(t.outputs()['has-changes']).toBe('true');
    expect(t.outputs()['changed-files']).toBe('locales/de.json,locales/fr.json');
    expect(t.summary()).toContain('| de | default | locales/de.json | created |');
  });

  it('reports no changes on a second run and only changed files afterwards', async () => {
    t.inputs({ locales: 'de, fr' });
    await t.run('pull');
    await t.run('pull');
    expect(t.outputs()['has-changes']).toBe('false');
    expect(t.outputs()['changed-files'] ?? '').toBe('');

    writeFileSync('locales/fr.json', '{}\n');
    await t.run('pull');
    expect(t.outputs()['has-changes']).toBe('true');
    expect(t.outputs()['changed-files']).toBe('locales/fr.json');
    expect(t.server.requests.some((r) => r.path.endsWith('/status'))).toBe(false);
  });

  it('writes one file per namespace and honors format, fallback and indent', async () => {
    t.inputs({ locales: 'de', namespaces: 'common,auth', format: 'flat', fallback: 'empty', indent: '4' });

    await t.run('pull');

    expect(t.server.requests[0].query).toEqual({ namespace: 'common', format: 'flat', fallback: 'empty' });
    expect(readFileSync('locales/de/auth.json', 'utf8')).toContain('\n    "greeting"');
    expect(existsSync('locales/de/common.json')).toBe(true);
  });

  it('applies a custom path template', async () => {
    t.inputs({ locales: 'de', 'path-template': 'src/i18n/{locale}/messages.json' });
    await t.run('pull');
    expect(existsSync('src/i18n/de/messages.json')).toBe(true);
  });

  it('rejects a template that maps several downloads to one file', async () => {
    t.inputs({ namespaces: 'a,b', locales: 'de', 'path-template': '{locale}.json' });
    await t.run('pull');
    expect(t.errors()[0]).toContain('writes several files');
  });

  it('rejects locales that would escape the target directory', async () => {
    t.inputs({ locales: '..' });
    await t.run('pull');
    expect(t.errors()[0]).toContain('Unsafe locale');
    expect(t.server.requests).toHaveLength(0);
  });

  it('writes nothing if one download fails', async () => {
    t.inputs({ locales: 'de,xx' });
    t.server.state.override = (request, response) => {
      if (!request.path.endsWith('/xx')) return false;
      response.writeHead(404).end('{"error":"Unknown locale."}');
      return true;
    };

    await t.run('pull');
    expect(t.errors()[0]).toContain('HTTP 404');
    expect(existsSync('locales')).toBe(false);
  });
});
