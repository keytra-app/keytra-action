import { type HttpMethod, KeytraApiError } from './errors';
import type { JsonObject, ProjectStatus, PullQuery, PushStats } from './types';
import { isJsonObject, isProjectStatus, isPushStats } from './validate';

const EXCERPT_LENGTH = 500;
const DEFAULT_TIMEOUT_MS = 30_000;

type Exchange = { method: HttpMethod; endpoint: string; response: Response; body: string };

const excerpt = (body: string): string =>
  (body.length > EXCERPT_LENGTH ? `${body.slice(0, EXCERPT_LENGTH)}…` : body) || '(empty body)';

const statusLine = (response: Response): string => `HTTP ${response.status} ${response.statusText}`;

const isRedirect = (status: number): boolean => status >= 300 && status < 400;

function normalizeBaseUrl(url: string): string {
  const baseUrl = url.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(baseUrl) || !URL.canParse(baseUrl)) {
    throw new Error(`Input "url" must be an http(s) URL, got "${url}".`);
  }
  return baseUrl;
}

function responseError({ method, endpoint, response, body }: Exchange, reason: string): KeytraApiError {
  return new KeytraApiError({ method, endpoint, reason, status: response.status, details: excerpt(body) });
}

function assertSuccess(exchange: Exchange): void {
  const { response, body } = exchange;
  if (isRedirect(response.status)) {
    const location = response.headers.get('location');
    throw responseError(exchange, `${statusLine(response)} redirect to ${location}. Set "url" to the final address.`);
  }
  if (!response.ok) throw responseError(exchange, `${statusLine(response)}: ${excerpt(body)}`);
}

function parseBody<T>(exchange: Exchange, isValid: (value: unknown) => value is T): T {
  const { response, body } = exchange;
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    throw responseError(exchange, `${statusLine(response)} returned invalid JSON: ${excerpt(body)}`);
  }
  if (!isValid(data)) {
    throw responseError(exchange, `${statusLine(response)} returned an unexpected response: ${excerpt(body)}`);
  }
  return data;
}

function describeNetworkError(error: unknown, timeoutMs: number): string {
  if (!(error instanceof Error)) return String(error);
  if (error.name === 'TimeoutError') return `timed out after ${timeoutMs} ms`;
  // fetch() reports "fetch failed" and hides the useful reason (e.g. ECONNREFUSED) in its cause.
  return (error.cause instanceof Error && error.cause.message) || error.message;
}

export class KeytraClient {
  private readonly baseUrl: string;

  constructor(
    url: string,
    private readonly apiKey: string,
    private readonly project: string,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {
    this.baseUrl = normalizeBaseUrl(url);
  }

  push(namespace: string, prune: boolean, body: string): Promise<PushStats> {
    const query = new URLSearchParams({ namespace, prune: String(prune) });
    return this.request('POST', `push?${query}`, isPushStats, body);
  }

  pull(locale: string, query: PullQuery): Promise<JsonObject> {
    return this.request('GET', `pull/${encodeURIComponent(locale)}?${new URLSearchParams(query)}`, isJsonObject);
  }

  status(): Promise<ProjectStatus> {
    return this.request('GET', 'status', isProjectStatus);
  }

  private async request<T>(
    method: HttpMethod,
    path: string,
    isValid: (value: unknown) => value is T,
    body?: string,
  ): Promise<T> {
    const endpoint = `${this.baseUrl}/api/v1/projects/${encodeURIComponent(this.project)}/${path}`;
    const exchange = await this.send(method, endpoint, body);
    assertSuccess(exchange);
    return parseBody(exchange, isValid);
  }

  private async send(method: HttpMethod, endpoint: string, body?: string): Promise<Exchange> {
    try {
      const response = await fetch(endpoint, {
        method,
        body,
        headers: this.headers(body !== undefined),
        // Following a redirect can turn a POST into a GET or drop the Authorization header.
        redirect: 'manual',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      return { method, endpoint, response, body: await response.text() };
    } catch (error) {
      throw new KeytraApiError({ method, endpoint, reason: describeNetworkError(error, this.timeoutMs), cause: error });
    }
  }

  private headers(hasBody: boolean): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    };
  }
}
