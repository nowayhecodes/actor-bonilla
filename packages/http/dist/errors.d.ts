import { RequestError, type NormalizedOptions, type HttpResponse } from './types.js';
export { RequestError };
export declare class HTTPError extends RequestError {
    readonly name: string;
    readonly response: HttpResponse;
    constructor(response: HttpResponse, options: NormalizedOptions);
}
export declare class TimeoutError extends RequestError {
    readonly name: string;
    readonly event: string;
    constructor(event: string, options: NormalizedOptions);
}
export declare class RetryError extends RequestError {
    readonly name: string;
    constructor(message: string, options: NormalizedOptions, response?: HttpResponse);
}
export declare class ParseError extends RequestError {
    readonly name: string;
    readonly cause: Error;
    constructor(cause: Error, options: NormalizedOptions, response?: HttpResponse);
}
export declare class CacheError extends RequestError {
    readonly name: string;
    constructor(message: string, options: NormalizedOptions);
}
export declare class MaxRedirectsError extends RequestError {
    readonly name: string;
    constructor(options: NormalizedOptions, response: HttpResponse);
}
export declare class UnsupportedProtocolError extends RequestError {
    readonly name: string;
    constructor(options: NormalizedOptions);
}
/** Normalise any thrown value into a RequestError. */
export declare function normalizeError(err: unknown, options: NormalizedOptions): RequestError;
