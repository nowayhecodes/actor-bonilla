export const RETRY_METHODS = [
    'GET', 'PUT', 'HEAD', 'DELETE', 'OPTIONS', 'TRACE',
];
export const RETRY_STATUS_CODES = [
    408, 413, 429, 500, 502, 503, 504, 521, 522, 524,
];
export const RETRY_ERROR_CODES = [
    'ETIMEDOUT',
    'ECONNRESET',
    'EADDRINUSE',
    'ECONNREFUSED',
    'EPIPE',
    'ENOTFOUND',
    'ENETUNREACH',
    'EAI_AGAIN',
];
export function defaultRetryDelay(retryCount, retryAfter) {
    if (retryAfter !== undefined)
        return retryAfter;
    const base = 1000 * 2 ** (retryCount - 1);
    const jitter = Math.floor(Math.random() * 100);
    return base + jitter;
}
export const DEFAULT_TIMEOUT = {
    request: 0, // 0 = disabled
};
export const DEFAULT_RETRY = {
    limit: 2,
    methods: RETRY_METHODS,
    statusCodes: RETRY_STATUS_CODES,
    errorCodes: RETRY_ERROR_CODES,
    calculateDelay: ({ retryCount, retryAfter, computedValue }) => retryAfter !== undefined ? retryAfter : computedValue,
    backoffLimit: 0x7fff_ffff,
    maxRetryAfter: 0x7fff_ffff,
};
export const DEFAULT_HOOKS = {
    init: [],
    beforeRequest: [],
    afterResponse: [],
    beforeError: [],
    beforeRetry: [],
    beforeRedirect: [],
};
export const IDEMPOTENT_METHODS = new Set([
    'GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS', 'TRACE',
]);
export const CACHEABLE_METHODS = new Set(['GET', 'HEAD']);
export const CACHEABLE_STATUS_CODES = new Set([
    200, 203, 204, 300, 301, 302, 404, 405, 410, 414, 501,
]);
//# sourceMappingURL=defaults.js.map