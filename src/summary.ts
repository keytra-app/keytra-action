import * as core from '@actions/core';
import { errorMessage } from './errors';
import type { Report, TableRow } from './types';

const escapeCell = (value: string | number): string =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/\|/g, '\\|')
    .replace(/[\r\n]+/g, ' ');

const tableLine = (cells: TableRow): string => `| ${cells.map(escapeCell).join(' | ')} |`;

export function markdownTable(headers: string[], rows: TableRow[]): string {
  return [tableLine(headers), tableLine(headers.map(() => '---')), ...rows.map(tableLine)].join('\n');
}

/** Sets the `summary-json` output and appends a table to the job summary. */
export async function writeReport({ title, json, headers, rows }: Report): Promise<void> {
  core.setOutput('summary-json', JSON.stringify(json));
  const body = rows.length ? markdownTable(headers, rows) : '_Nothing to report._';
  try {
    await core.summary.addRaw(`### ${title}\n\n${body}\n`, true).write();
  } catch (error) {
    // A missing summary file must not fail a sync that already happened.
    core.warning(`Could not write the job summary: ${errorMessage(error)}`);
  }
}
