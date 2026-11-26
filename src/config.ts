import * as core from '@actions/core';
import type { Mode, PullFallback, PullFormat } from './types';

export type ConnectionConfig = { mode: Mode; url: string; apiKey: string; project: string };
export type PushConfig = { sourcePath: string; namespace: string; prune: boolean };
export type PullConfig = {
  format: PullFormat;
  fallback: PullFallback;
  indent: number;
  namespaces: string[];
  locales: string[];
  pathTemplate: string;
};
export type StatusConfig = { failOnIncomplete: boolean };

const MODES = ['push', 'pull', 'status'] as const;
const DEFAULT_NAMESPACE = 'default';

const listInput = (name: string): string[] => [
  ...new Set(
    core
      .getInput(name)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  ),
];

const booleanInput = (name: string): boolean => core.getInput(name) !== '' && core.getBooleanInput(name);

/** The first option is the default. */
function enumInput<T extends string>(name: string, options: readonly [T, ...T[]], inputOptions?: core.InputOptions): T {
  const value = core.getInput(name, inputOptions) || options[0];
  const match = options.find((option) => option === value);
  if (!match) throw new Error(`Input "${name}" must be one of ${options.join(', ')}, got "${value}".`);
  return match;
}

function indentInput(): number {
  const value = core.getInput('indent') || '2';
  if (!/^(\d|10)$/.test(value)) throw new Error(`Input "indent" must be a number from 0 to 10, got "${value}".`);
  return Number(value);
}

export function readConnectionConfig(): ConnectionConfig {
  // Mask first, so no later message can leak the key.
  const apiKey = core.getInput('api-key', { required: true });
  core.setSecret(apiKey);

  return {
    apiKey,
    mode: enumInput('mode', MODES, { required: true }),
    url: core.getInput('url', { required: true }),
    project: core.getInput('project', { required: true }),
  };
}

export function readPushConfig(): PushConfig {
  return {
    sourcePath: core.getInput('source-path', { required: true }),
    prune: booleanInput('prune'),
    namespace: core.getInput('namespace') || DEFAULT_NAMESPACE,
  };
}

export function readPullConfig(): PullConfig {
  const format = enumInput('format', ['nested', 'flat']);
  const fallback = enumInput('fallback', ['source', 'empty']);
  const indent = indentInput();
  const listed = listInput('namespaces');
  const namespaces = listed.length ? listed : [core.getInput('namespace') || DEFAULT_NAMESPACE];
  const pathTemplate =
    core.getInput('path-template') ||
    (namespaces.length > 1 ? 'locales/{locale}/{namespace}.json' : 'locales/{locale}.json');

  return { format, fallback, indent, namespaces, pathTemplate, locales: listInput('locales') };
}

export function readStatusConfig(): StatusConfig {
  return { failOnIncomplete: booleanInput('fail-on-incomplete') };
}
