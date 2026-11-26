export type Mode = 'push' | 'pull' | 'status';
export type PullFormat = 'nested' | 'flat';
export type PullFallback = 'source' | 'empty';

export type PushStats = { added: number; updated: number; unchanged: number; pruned: number };

export type LocaleStatus = {
  code: string;
  name: string;
  total: number;
  translated: number;
  outdated: number;
  missing: number;
  percentage: number;
};

export type ProjectStatus = {
  slug: string;
  sourceLocale: string;
  totalKeys: number;
  locales: LocaleStatus[];
};

export type PullQuery = { namespace: string; format: PullFormat; fallback: PullFallback };

export type JsonObject = Record<string, unknown>;

export type TableRow = (string | number)[];

export type Report = { title: string; json: object; headers: string[]; rows: TableRow[] };

export type ModeResult = {
  report: Report;
  outputs?: Record<string, string>;
  /** Set when the step must fail after its report was written. */
  failure?: string;
};
