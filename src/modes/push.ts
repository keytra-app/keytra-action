import * as core from '@actions/core';
import { glob, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { KeytraClient } from '../client';
import type { PushConfig } from '../config';
import { errorMessage } from '../errors';
import type { ModeResult, PushStats } from '../types';
import { isJsonObject } from '../validate';

type Source = { namespace: string; file: string; body: string };
type PushResult = { namespace: string; file: string } & PushStats;

const statOrNull = (path: string) => stat(path).catch(() => null);

/** A file, a directory (its direct *.json files) or a glob. */
async function findFiles(sourcePath: string): Promise<string[]> {
  const info = await statOrNull(sourcePath);
  if (info?.isFile()) return [sourcePath];

  const matches = info?.isDirectory() ? glob('*.json', { cwd: sourcePath }) : glob(sourcePath);
  const files: string[] = [];
  for await (const match of matches) {
    const file = info ? join(sourcePath, match) : match;
    if ((await statOrNull(file))?.isFile()) files.push(file);
  }
  return files.sort();
}

async function readSource(file: string): Promise<string> {
  const text = (await readFile(file, 'utf8')).replace(/^﻿/, '');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`${file} is not valid JSON: ${errorMessage(error)}`);
  }
  if (!isJsonObject(data)) throw new Error(`${file} must contain a JSON object.`);
  return text;
}

const namespaceOf = (file: string): string => basename(file).replace(/\.json$/i, '');

async function readSources(files: string[], singleFileNamespace: string): Promise<Source[]> {
  const sources = new Map<string, Source>();
  for (const file of files) {
    const namespace = files.length > 1 ? namespaceOf(file) : singleFileNamespace;
    const other = sources.get(namespace);
    // With prune, the second file would delete the keys of the first.
    if (other) throw new Error(`${other.file} and ${file} both map to namespace "${namespace}".`);
    sources.set(namespace, { namespace, file, body: await readSource(file) });
  }
  return [...sources.values()];
}

async function pushSource(
  client: KeytraClient,
  { namespace, file, body }: Source,
  prune: boolean,
): Promise<PushResult> {
  const { added, updated, unchanged, pruned } = await client.push(namespace, prune, body);
  core.info(`${file} → ${namespace}: ${added} added, ${updated} updated, ${unchanged} unchanged, ${pruned} pruned`);
  return { namespace, file, added, updated, unchanged, pruned };
}

function pushResult(results: PushResult[], failure?: string): ModeResult {
  const sum = (key: keyof PushStats) => results.reduce((total, result) => total + result[key], 0);
  const totals = { added: sum('added'), updated: sum('updated'), unchanged: sum('unchanged'), pruned: sum('pruned') };
  return {
    report: {
      title: 'Keytra push',
      json: { mode: 'push', totals, namespaces: results },
      headers: ['Namespace', 'Added', 'Updated', 'Unchanged', 'Pruned'],
      rows: results.map((r) => [r.namespace, r.added, r.updated, r.unchanged, r.pruned]),
    },
    failure,
  };
}

export async function push(client: KeytraClient, config: PushConfig): Promise<ModeResult> {
  const files = await findFiles(config.sourcePath);
  if (!files.length) throw new Error(`No files match source-path "${config.sourcePath}".`);

  // Read and validate everything first, so a broken file doesn't leave a half-finished push.
  const sources = await readSources(files, config.namespace);

  const results: PushResult[] = [];
  for (const source of sources) {
    try {
      results.push(await pushSource(client, source, config.prune));
    } catch (error) {
      // Still report, so the summary shows which namespaces were already pushed.
      return pushResult(results, errorMessage(error));
    }
  }
  return pushResult(results);
}
