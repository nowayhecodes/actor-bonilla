// ============================================================================
// @actor-bonilla/http — Error hierarchy
// ============================================================================
import { RequestError } from './types.js';
export { RequestError };
export class HTTPError extends RequestError {
    name = 'HTTPError';
    response;
    constructor(response, options) {
        super(`Response code ${response.statusCode} (${response.statusMessage ?? 'Unknown'})`, options, 'ERR_NON_2XX_3XX_RESPONSE', response);
        this.response = response;
    }
}
export class TimeoutError extends RequestError {
    name = 'TimeoutError';
    event;
    constructor(event, options) {
        super(`Timeout awaiting '${event}'`, options, 'ETIMEDOUT');
        this.event = event;
    }
}
export class RetryError extends RequestError {
    name = 'RetryError';
    constructor(message, options, response) {
        super(message, options, 'ERR_RETRIES_EXHAUSTED', response);
    }
}
export class ParseError extends RequestError {
    name = 'ParseError';
    cause;
    constructor(cause, options, response) {
        super(`Body parse error: ${cause.message}`, options, 'ERR_BODY_PARSE', response);
        this.cause = cause;
    }
}
export class CacheError extends RequestError {
    name = 'CacheError';
    constructor(message, options) {
        super(message, options, 'ERR_CACHE');
    }
}
export class MaxRedirectsError extends RequestError {
    name = 'MaxRedirectsError';
    constructor(options, response) {
        super(`Redirected ${options.maxRedirects} times. Aborting.`, options, 'ERR_TOO_MANY_REDIRECTS', response);
    }
}
export class UnsupportedProtocolError extends RequestError {
    name = 'UnsupportedProtocolError';
    constructor(options) {
        super(`Unsupported protocol: ${options.url.protocol}`, options, 'ERR_UNSUPPORTED_PROTOCOL');
    }
}
/** Normalise any thrown value into a RequestError. */
export function normalizeError(err, options) {
    if (err instanceof RequestError)
        return err;
    if (err instanceof Error) {
        const req = new RequestError(err.message, options, err.code ?? 'ERR_REQUEST');
        req.stack = err.stack;
        return req;
    }
    return new RequestError(String(err), options);
}
//# sourceMappingURL=errors.js.map