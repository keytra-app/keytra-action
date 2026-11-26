import * as core from '@actions/core';
import { KeytraClient } from './client';
import { readConnectionConfig, readPullConfig, readPushConfig, readStatusConfig } from './config';
import { errorMessage } from './errors';
import { pull } from './modes/pull';
import { push } from './modes/push';
import { status } from './modes/status';
import { writeReport } from './summary';
import type { Mode, ModeResult } from './types';

function runMode(mode: Mode, client: KeytraClient): Promise<ModeResult> {
  switch (mode) {
    case 'push':
      return push(client, readPushConfig());
    case 'pull':
      return pull(client, readPullConfig());
    case 'status':
      return status(client, readStatusConfig());
  }
}

async function writeResult({ outputs = {}, report, failure }: ModeResult): Promise<void> {
  for (const [name, value] of Object.entries(outputs)) core.setOutput(name, value);
  await writeReport(report);
  if (failure) core.setFailed(failure);
}

/** Runs the action. Never rejects: every error fails the step instead. */
export async function run(): Promise<void> {
  try {
    const { mode, url, apiKey, project } = readConnectionConfig();
    const client = new KeytraClient(url, apiKey, project);
    await writeResult(await runMode(mode, client));
  } catch (error) {
    core.setFailed(errorMessage(error));
  }
}
