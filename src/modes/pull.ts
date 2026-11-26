import * as core from '@actions/core';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, normalize } from 'node:path';
import type { KeytraClient } from '../client';
import type { PullConfig } from '../config';
import type { ModeResult } from '../types';

type FileStatus = 'created' | 'updated' | 'unchanged';
type Target = { locale: string; namespace: string; path: string };
type Download = Target & { content: string };
type PulledFile = Target & { status: FileStatus };

/** Locales and namespaces become path segments, so they must not escape the template. */
function assertSafeSegment(kind: string, value: string): void {
  if (/[/\\\0]/.test(value) || value === '.' || value === '..') {
    throw new Error(`Unsafe ${kind} "${value}": it can't be used in a file path.`);
  }
}

async function resolveLocales(client: KeytraClient, configured: string[]): Promise<string[]> {
  if (configured.length) return configured;
  const locales = (await client.status()).locales.map((locale) => locale.code);
  if (!locales.length) core.warning('The project has no target locales. Nothing to pull.');
  return locales;
}

const renderPath = (template: string, locale: string, namespace: string): string =>
  normalize(template.replaceAll('{locale}', () => locale).replaceAll('{namespace}', () => namespace));

function planTargets(template: string, locales: string[], namespaces: string[]): Target[] {
  const targets = new Map<string, Target>();
  for (const locale of locales) {
    assertSafeSegment('locale', locale);
    for (const namespace of namespaces) {
      assertSafeSegment('namespace', namespace);
      const path = renderPath(template, locale, namespace);
      if (targets.has(path)) {
        throw new Error(
          `path-template "${template}" writes several files to "${path}". Add {locale} and/or {namespace}.`,
        );
      }
      targets.set(path, { locale, namespace, path });
    }
  }
  return [...targets.values()];
}

async function download(client: KeytraClient, target: Target, config: PullConfig): Promise<Download> {
  const { locale, namespace } = target;
  const data = await client.pull(locale, { namespace, format: config.format, fallback: config.fallback });
  if (!Object.keys(data).length) {
    core.warning(`Locale "${locale}", namespace "${namespace}" is empty. Check the namespace name.`);
  }
  return { ...target, content: `${JSON.stringify(data, null, config.indent)}\n` };
}

async function readExisting(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeDownload({ content, ...target }: Download): Promise<PulledFile> {
  const existing = await readExisting(target.path);
  const status: FileStatus = existing === null ? 'created' : existing === content ? 'unchanged' : 'updated';
  if (status !== 'unchanged') {
    await mkdir(dirname(target.path), { recursive: true });
    await writeFile(target.path, content);
  }
  core.info(`${target.path}: ${status}`);
  return { ...target, status };
}

function pullResult(files: PulledFile[]): ModeResult {
  const changed = files.filter((file) => file.status !== 'unchanged').map((file) => file.path);
  return {
    outputs: { 'changed-files': changed.join(','), 'has-changes': String(changed.length > 0) },
    report: {
      title: 'Keytra pull',
      json: { mode: 'pull', changed: changed.length, files },
      headers: ['Locale', 'Namespace', 'Path', 'Status'],
      rows: files.map((file) => [file.locale, file.namespace, file.path, file.status]),
    },
  };
}

export async function pull(client: KeytraClient, config: PullConfig): Promise<ModeResult> {
  const locales = await resolveLocales(client, config.locales);
  const targets = planTargets(config.pathTemplate, locales, config.namespaces);

  // Download everything before writing, so a failed request leaves the workspace untouched.
  const downloads: Download[] = [];
  for (const target of targets) downloads.push(await download(client, target, config));

  const files: PulledFile[] = [];
  for (const item of downloads) files.push(await writeDownload(item));
  return pullResult(files);
}
