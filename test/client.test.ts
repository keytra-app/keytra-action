import { describe, expect, it } from 'vitest';
import { KeytraClient } from '../src/client';
import { KeytraApiError } from '../src/errors';
import { useAction } from './helpers';
import { API_KEY } from './mock-server.mts';

const t = useAction();

describe('client', () => {
  it('includes status and body in errors, never the key', async () => {
    const client = new KeytraClient(t.server.url, 'ktr_wrong', 'demo');
    const error = await client.status().catch((e: Error) => e.message);
    expect(error).toContain('HTTP 401 Unauthorized: {"error":"Invalid or missing API key."}');
    expect(error).not.toContain('ktr_wrong');
  });

  it('exposes status, endpoint and details on API errors', async () => {
    t.server.state.override = (_, response) => {
      response.writeHead(500).end('boom');
      return true;
    };
    const error = await t.client.status().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(KeytraApiError);
    expect(error).toMatchObject({
      status: 500,
      endpoint: `${t.server.url}/api/v1/projects/demo/status`,
      details: 'boom',
    });
  });

  it('times out', async () => {
    t.server.state.override = () => true;
    await expect(new KeytraClient(t.server.url, API_KEY, 'demo', 50).status()).rejects.toThrow('timed out after 50 ms');
  });

  it('does not follow redirects', async () => {
    t.server.state.override = (_, response) => {
      response.writeHead(301, { Location: 'https://elsewhere.test/' }).end();
      return true;
    };
    await expect(t.client.push('default', false, '{}')).rejects.toThrow('redirect to https://elsewhere.test/');
    expect(t.server.requests).toHaveLength(1);
  });

  it.each(['<html>login</html>', '{"unexpected":true}'])('rejects the response %s', async (body) => {
    t.server.state.override = (_, response) => {
      response.end(body);
      return true;
    };
    await expect(t.client.status()).rejects.toThrow(body);
  });

  it('explains connection errors', async () => {
    await expect(new KeytraClient('http://127.0.0.1:1', API_KEY, 'demo').status()).rejects.toThrow(
      /failed: .*(ECONNREFUSED|bad port)/,
    );
  });

  it('rejects a URL without http(s)', () => {
    expect(() => new KeytraClient('keytra.example.com', API_KEY, 'demo')).toThrow('http(s) URL');
  });
});
