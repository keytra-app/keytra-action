import * as core from '@actions/core';
import type { KeytraClient } from '../client';
import type { StatusConfig } from '../config';
import type { LocaleStatus, ModeResult } from '../types';

const isIncomplete = (locale: LocaleStatus): boolean => locale.missing > 0 || locale.outdated > 0;

const progressLine = (l: LocaleStatus): string =>
  `${l.code}: ${l.percentage}% (${l.translated}/${l.total}, ${l.outdated} outdated, ${l.missing} missing)`;

const incompleteMessage = (locales: LocaleStatus[]): string =>
  `Incomplete translations: ${locales.map((l) => `${l.code} (${l.missing} missing, ${l.outdated} outdated)`).join(', ')}`;

export async function status(client: KeytraClient, config: StatusConfig): Promise<ModeResult> {
  const project = await client.status();
  const incomplete = project.locales.filter(isIncomplete);
  for (const locale of project.locales) core.info(progressLine(locale));

  return {
    report: {
      title: 'Keytra status',
      json: { mode: 'status', ...project, incomplete: incomplete.map((l) => l.code) },
      headers: ['Locale', 'Progress %', 'Translated', 'Outdated', 'Missing'],
      rows: project.locales.map((l) => [l.code, l.percentage, l.translated, l.outdated, l.missing]),
    },
    failure: config.failOnIncomplete && incomplete.length ? incompleteMessage(incomplete) : undefined,
  };
}
