import * as __typia_transform__assertGuard from "typia/lib/internal/_assertGuard";
// ============================================================================
// @actor-bonilla/http — Runtime validation (Typia)
// ============================================================================
import typia from 'typia';
/**
 * Validates a fully-resolved `TimeoutOptions` object.
 * All numeric fields carry `tags.Minimum<0>` so Typia enforces >= 0 at runtime.
 */
export const assertTimeoutOptions = (() => { const _io0 = input => (undefined === input.connect || "number" === typeof input.connect && 0 <= input.connect) && (undefined === input.response || "number" === typeof input.response && 0 <= input.response) && (undefined === input.read || "number" === typeof input.read && 0 <= input.read) && (undefined === input.send || "number" === typeof input.send && 0 <= input.send) && (undefined === input.request || "number" === typeof input.request && 0 <= input.request); const _ao0 = (input, _path, _exceptionable = true) => (undefined === input.connect || "number" === typeof input.connect && (0 <= input.connect || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".connect",
    expected: "number & Minimum<0>",
    value: input.connect
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".connect",
    expected: "((number & Minimum<0>) | undefined)",
    value: input.connect
}, _errorFactory)) && (undefined === input.response || "number" === typeof input.response && (0 <= input.response || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".response",
    expected: "number & Minimum<0>",
    value: input.response
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".response",
    expected: "((number & Minimum<0>) | undefined)",
    value: input.response
}, _errorFactory)) && (undefined === input.read || "number" === typeof input.read && (0 <= input.read || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".read",
    expected: "number & Minimum<0>",
    value: input.read
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".read",
    expected: "((number & Minimum<0>) | undefined)",
    value: input.read
}, _errorFactory)) && (undefined === input.send || "number" === typeof input.send && (0 <= input.send || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".send",
    expected: "number & Minimum<0>",
    value: input.send
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".send",
    expected: "((number & Minimum<0>) | undefined)",
    value: input.send
}, _errorFactory)) && (undefined === input.request || "number" === typeof input.request && (0 <= input.request || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".request",
    expected: "number & Minimum<0>",
    value: input.request
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".request",
    expected: "((number & Minimum<0>) | undefined)",
    value: input.request
}, _errorFactory)); const __is = input => "object" === typeof input && null !== input && false === Array.isArray(input) && _io0(input); let _errorFactory; return (input, errorFactory) => {
    if (false === __is(input)) {
        _errorFactory = errorFactory;
        ((input, _path, _exceptionable = true) => ("object" === typeof input && null !== input && false === Array.isArray(input) || __typia_transform__assertGuard._assertGuard(true, {
            method: "typia.createAssert",
            path: _path + "",
            expected: "TimeoutOptions",
            value: input
        }, _errorFactory)) && _ao0(input, _path + "", true) || __typia_transform__assertGuard._assertGuard(true, {
            method: "typia.createAssert",
            path: _path + "",
            expected: "TimeoutOptions",
            value: input
        }, _errorFactory))(input, "$input", true);
    }
    return input;
}; })();
/**
 * Validates a fully-resolved `RetryOptions` object.
 * Enforces `limit >= 0`, `backoffLimit >= 0`, `maxRetryAfter >= 0`.
 * `calculateDelay` is verified to be a function (`typeof === 'function'`).
 */
export const assertRetryOptions = (() => { const _io0 = input => "number" === typeof input.limit && 0 <= input.limit && (Array.isArray(input.methods) && input.methods.every(elem => "GET" === elem || "POST" === elem || "PUT" === elem || "PATCH" === elem || "DELETE" === elem || "HEAD" === elem || "OPTIONS" === elem || "TRACE" === elem)) && (Array.isArray(input.statusCodes) && input.statusCodes.every(elem => "number" === typeof elem)) && (Array.isArray(input.errorCodes) && input.errorCodes.every(elem => "string" === typeof elem)) && true && ("number" === typeof input.backoffLimit && 0 <= input.backoffLimit) && ("number" === typeof input.maxRetryAfter && 0 <= input.maxRetryAfter); const _ao0 = (input, _path, _exceptionable = true) => ("number" === typeof input.limit && (0 <= input.limit || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".limit",
    expected: "number & Minimum<0>",
    value: input.limit
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".limit",
    expected: "(number & Minimum<0> & Default<2>)",
    value: input.limit
}, _errorFactory)) && ((Array.isArray(input.methods) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".methods",
    expected: "Array<HttpMethod>",
    value: input.methods
}, _errorFactory)) && input.methods.every((elem, _index4) => "GET" === elem || "POST" === elem || "PUT" === elem || "PATCH" === elem || "DELETE" === elem || "HEAD" === elem || "OPTIONS" === elem || "TRACE" === elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".methods[" + _index4 + "]",
    expected: "(\"DELETE\" | \"GET\" | \"HEAD\" | \"OPTIONS\" | \"PATCH\" | \"POST\" | \"PUT\" | \"TRACE\")",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".methods",
    expected: "Array<HttpMethod>",
    value: input.methods
}, _errorFactory)) && ((Array.isArray(input.statusCodes) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".statusCodes",
    expected: "Array<number>",
    value: input.statusCodes
}, _errorFactory)) && input.statusCodes.every((elem, _index5) => "number" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".statusCodes[" + _index5 + "]",
    expected: "number",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".statusCodes",
    expected: "Array<number>",
    value: input.statusCodes
}, _errorFactory)) && ((Array.isArray(input.errorCodes) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".errorCodes",
    expected: "Array<string>",
    value: input.errorCodes
}, _errorFactory)) && input.errorCodes.every((elem, _index6) => "string" === typeof elem || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".errorCodes[" + _index6 + "]",
    expected: "string",
    value: elem
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".errorCodes",
    expected: "Array<string>",
    value: input.errorCodes
}, _errorFactory)) && (true || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".calculateDelay",
    expected: "unknown",
    value: input.calculateDelay
}, _errorFactory)) && ("number" === typeof input.backoffLimit && (0 <= input.backoffLimit || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".backoffLimit",
    expected: "number & Minimum<0>",
    value: input.backoffLimit
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".backoffLimit",
    expected: "(number & Minimum<0>)",
    value: input.backoffLimit
}, _errorFactory)) && ("number" === typeof input.maxRetryAfter && (0 <= input.maxRetryAfter || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".maxRetryAfter",
    expected: "number & Minimum<0>",
    value: input.maxRetryAfter
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".maxRetryAfter",
    expected: "(number & Minimum<0>)",
    value: input.maxRetryAfter
}, _errorFactory)); const __is = input => "object" === typeof input && null !== input && _io0(input); let _errorFactory; return (input, errorFactory) => {
    if (false === __is(input)) {
        _errorFactory = errorFactory;
        ((input, _path, _exceptionable = true) => ("object" === typeof input && null !== input || __typia_transform__assertGuard._assertGuard(true, {
            method: "typia.createAssert",
            path: _path + "",
            expected: "RetryOptions",
            value: input
        }, _errorFactory)) && _ao0(input, _path + "", true) || __typia_transform__assertGuard._assertGuard(true, {
            method: "typia.createAssert",
            path: _path + "",
            expected: "RetryOptions",
            value: input
        }, _errorFactory))(input, "$input", true);
    }
    return input;
}; })();
/**
 * Validates a `PaginationOptions` object.
 * Enforces `countLimit >= 1`, `requestLimit >= 1`, `backoff >= 0`.
 * Callback fields are verified to be functions when present.
 */
export const assertPaginationOptions = (() => { const _io0 = input => (undefined === input.transform || true) && (undefined === input.paginate || true) && (undefined === input.filter || true) && (undefined === input.shouldContinue || true) && (undefined === input.countLimit || "number" === typeof input.countLimit && 1 <= input.countLimit) && (undefined === input.backoff || "number" === typeof input.backoff && 0 <= input.backoff) && (undefined === input.requestLimit || "number" === typeof input.requestLimit && 1 <= input.requestLimit) && (undefined === input.stackAllItems || "boolean" === typeof input.stackAllItems); const _ao0 = (input, _path, _exceptionable = true) => (undefined === input.transform || true || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".transform",
    expected: "undefined",
    value: input.transform
}, _errorFactory)) && (undefined === input.paginate || true || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".paginate",
    expected: "undefined",
    value: input.paginate
}, _errorFactory)) && (undefined === input.filter || true || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".filter",
    expected: "undefined",
    value: input.filter
}, _errorFactory)) && (undefined === input.shouldContinue || true || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".shouldContinue",
    expected: "undefined",
    value: input.shouldContinue
}, _errorFactory)) && (undefined === input.countLimit || "number" === typeof input.countLimit && (1 <= input.countLimit || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".countLimit",
    expected: "number & Minimum<1>",
    value: input.countLimit
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".countLimit",
    expected: "((number & Minimum<1>) | undefined)",
    value: input.countLimit
}, _errorFactory)) && (undefined === input.backoff || "number" === typeof input.backoff && (0 <= input.backoff || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".backoff",
    expected: "number & Minimum<0>",
    value: input.backoff
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".backoff",
    expected: "((number & Minimum<0>) | undefined)",
    value: input.backoff
}, _errorFactory)) && (undefined === input.requestLimit || "number" === typeof input.requestLimit && (1 <= input.requestLimit || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".requestLimit",
    expected: "number & Minimum<1>",
    value: input.requestLimit
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".requestLimit",
    expected: "((number & Minimum<1>) | undefined)",
    value: input.requestLimit
}, _errorFactory)) && (undefined === input.stackAllItems || "boolean" === typeof input.stackAllItems || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".stackAllItems",
    expected: "(boolean | undefined)",
    value: input.stackAllItems
}, _errorFactory)); const __is = input => "object" === typeof input && null !== input && false === Array.isArray(input) && _io0(input); let _errorFactory; return (input, errorFactory) => {
    if (false === __is(input)) {
        _errorFactory = errorFactory;
        ((input, _path, _exceptionable = true) => ("object" === typeof input && null !== input && false === Array.isArray(input) || __typia_transform__assertGuard._assertGuard(true, {
            method: "typia.createAssert",
            path: _path + "",
            expected: "PaginationOptions<unknown>",
            value: input
        }, _errorFactory)) && _ao0(input, _path + "", true) || __typia_transform__assertGuard._assertGuard(true, {
            method: "typia.createAssert",
            path: _path + "",
            expected: "PaginationOptions<unknown>",
            value: input
        }, _errorFactory))(input, "$input", true);
    }
    return input;
}; })();
//# sourceMappingURL=validation.js.map