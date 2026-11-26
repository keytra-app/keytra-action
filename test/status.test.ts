import { describe, expect, it } from 'vitest';
import { useAction } from './helpers';

const t = useAction();

describe('status', () => {
  it('reports progress without failing by default', async () => {
    await t.run('status');

    expect(process.exitCode).toBe(0);
    expect(JSON.parse(t.outputs()['summary-json']).incomplete).toEqual(['fr']);
    expect(t.summary()).toContain('| Locale | Progress % | Translated | Outdated | Missing |');
    expect(t.summary()).toContain('| fr | 50 | 1 | 0 | 1 |');
  });

  it('fails on incomplete translations when requested', async () => {
    t.inputs({ 'fail-on-incomplete': 'true' });

    await t.run('status');

    expect(process.exitCode).toBe(1);
    expect(t.log()).toContain('::error::Incomplete translations: fr (1 missing, 0 outdated)');
  });

  it('fails on outdated translations', async () => {
    t.inputs({ 'fail-on-incomplete': 'true' });
    t.server.state.override = (_, response) => {
      const locale = { code: 'de', name: 'German', total: 1, translated: 0, outdated: 1, missing: 0, percentage: 0 };
      response.end(JSON.stringify({ slug: 'demo', sourceLocale: 'en', totalKeys: 1, locales: [locale] }));
      return true;
    };

    await t.run('status');

    expect(process.exitCode).toBe(1);
  });

  it('passes when everything is translated', async () => {
    t.inputs({ 'fail-on-incomplete': 'true' });
    t.server.state.complete = true;

    await t.run('status');

    expect(process.exitCode).toBe(0);
  });
});
