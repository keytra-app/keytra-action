import { describe, expect, it } from 'vitest';
import { useAction } from './helpers';
import { API_KEY } from './mock-server.mts';

const t = useAction();

describe('run', () => {
  it('masks the API key before anything else is logged', async () => {
    await t.run('status');
    expect(t.log().startsWith(`::add-mask::${API_KEY}`)).toBe(true);
  });

  it('fails on an unknown mode', async () => {
    await t.run('sync');
    expect(process.exitCode).toBe(1);
    expect(t.errors()).toEqual(['Input "mode" must be one of push, pull, status, got "sync".']);
    expect(t.server.requests).toHaveLength(0);
  });
});
