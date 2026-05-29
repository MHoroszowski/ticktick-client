export class TickTickError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TickTickError';
  }
}

export class TickTickAuthError extends TickTickError {
  constructor(message: string) {
    super(message);
    this.name = 'TickTickAuthError';
  }
}

export class TickTickApiError extends TickTickError {
  constructor(
    message: string,
    readonly url: string,
    readonly method: string,
    readonly status: number,
    readonly responseBody: unknown,
  ) {
    super(message);
    this.name = 'TickTickApiError';
  }
}

/**
 * Thrown when `POST /api/v2/batch/task` returns HTTP 200 but reports a
 * per-item failure via the `id2error` envelope. The most common cause
 * is an etag conflict — the task was modified between the SDK's
 * read-modify-write fetch and the write — but the envelope is open
 * (e.g. permission / shared-project edge cases). The `errors` map
 * keys task ids to the server's error string.
 *
 * Callers handling concurrent edits should catch this and re-call the
 * operation (the SDK will re-read the task body, getting the fresh
 * etag).
 */
export class TickTickBatchError extends TickTickError {
  constructor(
    message: string,
    readonly errors: Record<string, string>,
  ) {
    super(message);
    this.name = 'TickTickBatchError';
  }
}
