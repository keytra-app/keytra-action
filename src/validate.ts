import type { JsonObject, ProjectStatus, PushStats } from './types';

export const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isPushStats = (value: unknown): value is PushStats =>
  isJsonObject(value) && ['added', 'updated', 'unchanged', 'pruned'].every((key) => typeof value[key] === 'number');

// Checks only the fields this action relies on.
export const isProjectStatus = (value: unknown): value is ProjectStatus =>
  isJsonObject(value) &&
  Array.isArray(value.locales) &&
  value.locales.every(
    (locale) =>
      isJsonObject(locale) &&
      typeof locale.code === 'string' &&
      typeof locale.missing === 'number' &&
      typeof locale.outdated === 'number',
  );
