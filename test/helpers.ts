import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { KeytraClient } from '../src/client';
import { run } from '../src/run';
import { API_KEY, startMockServer } from './mock-server.mts';

/** Temp working directory, fresh mock server and real GitHub output/summary files per test. */
export function useAction() {
  const root = mkdtempSync(join(tmpdir(), 'keytra-action-'));
  const outputFile = join(root, 'output');
  const summaryFile = join(root, 'summary');
  const originalCwd = process.cwd();
  const originalEnv = { ...process.env };
  const ctx = {} as {
    server: Awaited<ReturnType<typeof startMockServer>>;
    client: KeytraClient;
    log: () => string;
    outputs: () => Record<string, string>;
    summary: () => string;
    inputs: (values: Record<string, string>) => void;
    run: (mode: string) => Promise<void>;
    errors: () => string[];
  };
  let log = '';

  beforeAll(() => {
    // @actions/core remembers the summary path, so it stays the same for the whole file.
    process.env.GITHUB_STEP_SUMMARY = summaryFile;
    process.env.GITHUB_OUTPUT = outputFile;
  });

  beforeEach(async () => {
    for (const key of Object.keys(process.env)) if (key.startsWith('INPUT_')) delete process.env[key];
    process.chdir(mkdtempSync(join(root, 'work-')));
    writeFileSync(outputFile, '');
    writeFileSync(summaryFile, '');
    log = '';
    process.exitCode = 0;
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      log += String(chunk);
      return true;
    });
    ctx.server = await startMockServer();
    ctx.client = new KeytraClient(`${ctx.server.url}///`, API_KEY, 'demo');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    process.exitCode = 0;
    await ctx.server.close();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  ctx.log = () => log;
  ctx.summary = () => readFileSync(summaryFile, 'utf8');
  ctx.outputs = () =>
    Object.fromEntries(
      [...readFileSync(outputFile, 'utf8').matchAll(/^(.+?)<<(.+?)\r?\n([\s\S]*?)\r?\n\2$/gm)].map((m) => [m[1], m[3]]),
    );
  ctx.inputs = (values) => {
    for (const [name, value] of Object.entries(values)) process.env[`INPUT_${name.toUpperCase()}`] = value;
  };
  ctx.run = (mode) => {
    ctx.inputs({ url: `${ctx.server.url}///`, 'api-key': API_KEY, project: 'demo', mode });
    return run();
  };
  ctx.errors = () => [...log.matchAll(/^::error::(.*)$/gm)].map((m) => m[1]);
  return ctx;
}
