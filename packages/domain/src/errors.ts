export const ERROR_CODES = [
  'INVALID_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'RATE_LIMITED',
  'EXECUTION_DISABLED',
  'UNAVAILABLE',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** An error whose code and message are safe to show to the caller. Anything else becomes INTERNAL. */
export class AppError extends Error {
  override name = 'AppError';
  readonly code: ErrorCode;
  /** When retrying can succeed, sent as the Retry-After header. */
  readonly retryAfterSeconds: number | undefined;

  constructor(code: ErrorCode, message: string, options?: ErrorOptions & { retryAfterSeconds?: number }) {
    super(message, options);
    this.code = code;
    this.retryAfterSeconds = options?.retryAfterSeconds;
  }
}
