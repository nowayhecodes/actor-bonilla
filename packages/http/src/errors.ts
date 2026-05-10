// ============================================================================
// @actor-bonilla/http — Error hierarchy
// ============================================================================

import { RequestError, type NormalizedOptions, type HttpResponse } from './types.js';

export { RequestError };

export class HTTPError extends RequestError {
  override readonly name: string = 'HTTPError';
  override readonly response: HttpResponse;

  constructor(response: HttpResponse, options: NormalizedOptions) {
    super(
      `Response code ${response.statusCode} (${response.statusMessage ?? 'Unknown'})`,
      options,
      'ERR_NON_2XX_3XX_RESPONSE',
      response
    );
    this.response = response;
  }
}

export class TimeoutError extends RequestError {
  override readonly name: string = 'TimeoutError';
  readonly event: string;

  constructor(event: string, options: NormalizedOptions) {
    super(`Timeout awaiting '${event}'`, options, 'ETIMEDOUT');
    this.event = event;
  }
}

export class RetryError extends RequestError {
  override readonly name: string = 'RetryError';

  constructor(message: string, options: NormalizedOptions, response?: HttpResponse) {
    super(message, options, 'ERR_RETRIES_EXHAUSTED', response);
  }
}

export class ParseError extends RequestError {
  override readonly name: string = 'ParseError';
  readonly cause: Error;

  constructor(cause: Error, options: NormalizedOptions, response?: HttpResponse) {
    super(`Body parse error: ${cause.message}`, options, 'ERR_BODY_PARSE', response);
    this.cause = cause;
  }
}

export class CacheError extends RequestError {
  override readonly name: string = 'CacheError';

  constructor(message: string, options: NormalizedOptions) {
    super(message, options, 'ERR_CACHE');
  }
}

export class MaxRedirectsError extends RequestError {
  override readonly name: string = 'MaxRedirectsError';

  constructor(options: NormalizedOptions, response: HttpResponse) {
    super(
      `Redirected ${options.maxRedirects} times. Aborting.`,
      options,
      'ERR_TOO_MANY_REDIRECTS',
      response
    );
  }
}

export class UnsupportedProtocolError extends RequestError {
  override readonly name: string = 'UnsupportedProtocolError';

  constructor(options: NormalizedOptions) {
    super(
      `Unsupported protocol: ${options.url.protocol}`,
      options,
      'ERR_UNSUPPORTED_PROTOCOL'
    );
  }
}

/** Normalise any thrown value into a RequestError. */
export function normalizeError(
  err: unknown,
  options: NormalizedOptions
): RequestError {
  if (err instanceof RequestError) return err;
  if (err instanceof Error) {
    const req = new RequestError(err.message, options, (err as NodeJS.ErrnoException).code ?? 'ERR_REQUEST');
    req.stack = err.stack;
    return req;
  }
  return new RequestError(String(err), options);
}
