// ─── Event channel symbols ────────────────────────────────────────────────────
export const HTTP_PROGRESS_CHANNEL = Symbol.for('@actor-bonilla/http.progress');
export const HTTP_REQUEST_CHANNEL = Symbol.for('@actor-bonilla/http.request');
export const HTTP_RESPONSE_CHANNEL = Symbol.for('@actor-bonilla/http.response');
export const HTTP_ERROR_CHANNEL = Symbol.for('@actor-bonilla/http.error');
// ─── RequestError (base) — also exported as a class from errors.ts ──────────
export class RequestError extends Error {
    name = 'RequestError';
    code;
    options;
    response;
    constructor(message, options, code = 'ERR_REQUEST', response) {
        super(message);
        this.code = code;
        this.options = options;
        this.response = response;
    }
}
//# sourceMappingURL=types.js.map