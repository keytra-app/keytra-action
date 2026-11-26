export type HttpMethod = 'GET' | 'POST';

type KeytraApiErrorInit = {
  method: HttpMethod;
  endpoint: string;
  reason: string;
  status?: number;
  details?: string;
  cause?: unknown;
};

export class KeytraApiError extends Error {
  override readonly name = 'KeytraApiError';
  readonly method: HttpMethod;
  readonly endpoint: string;
  readonly status?: number;
  readonly details?: string;

  constructor({ method, endpoint, reason, status, details, cause }: KeytraApiErrorInit) {
    super(`Keytra API ${method} ${endpoint} failed: ${reason}`, { cause });
    this.method = method;
    this.endpoint = endpoint;
    this.status = status;
    this.details = details;
  }
}

export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));
