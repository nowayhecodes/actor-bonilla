import * as __typia_transform__assertGuard from "typia/lib/internal/_assertGuard";
// ============================================================================
// actor-bonilla — Runtime validation (Typia)
// ============================================================================
import typia from 'typia';
/** Validates user-supplied actor system options before construction. */
export const assertActorSystemConfig = (() => { const _io0 = input => (undefined === input.name || "string" === typeof input.name && 1 <= input.name.length) && (undefined === input.defaultThroughput || "number" === typeof input.defaultThroughput && 1 <= input.defaultThroughput) && (undefined === input.logDeadLetters || "boolean" === typeof input.logDeadLetters) && (undefined === input.maxDeadLettersLogged || "number" === typeof input.maxDeadLettersLogged && 0 <= input.maxDeadLettersLogged); const _ao0 = (input, _path, _exceptionable = true) => (undefined === input.name || "string" === typeof input.name && (1 <= input.name.length || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".name",
    expected: "string & MinLength<1>",
    value: input.name
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".name",
    expected: "((string & MinLength<1>) | undefined)",
    value: input.name
}, _errorFactory)) && (undefined === input.defaultThroughput || "number" === typeof input.defaultThroughput && (1 <= input.defaultThroughput || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".defaultThroughput",
    expected: "number & Minimum<1>",
    value: input.defaultThroughput
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".defaultThroughput",
    expected: "((number & Minimum<1>) | undefined)",
    value: input.defaultThroughput
}, _errorFactory)) && (undefined === input.logDeadLetters || "boolean" === typeof input.logDeadLetters || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".logDeadLetters",
    expected: "(boolean | undefined)",
    value: input.logDeadLetters
}, _errorFactory)) && (undefined === input.maxDeadLettersLogged || "number" === typeof input.maxDeadLettersLogged && (0 <= input.maxDeadLettersLogged || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".maxDeadLettersLogged",
    expected: "number & Minimum<0>",
    value: input.maxDeadLettersLogged
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".maxDeadLettersLogged",
    expected: "((number & Minimum<0>) | undefined)",
    value: input.maxDeadLettersLogged
}, _errorFactory)); const __is = input => "object" === typeof input && null !== input && false === Array.isArray(input) && _io0(input); let _errorFactory; return (input, errorFactory) => {
    if (false === __is(input)) {
        _errorFactory = errorFactory;
        ((input, _path, _exceptionable = true) => ("object" === typeof input && null !== input && false === Array.isArray(input) || __typia_transform__assertGuard._assertGuard(true, {
            method: "typia.createAssert",
            path: _path + "",
            expected: "ActorSystemConfig",
            value: input
        }, _errorFactory)) && _ao0(input, _path + "", true) || __typia_transform__assertGuard._assertGuard(true, {
            method: "typia.createAssert",
            path: _path + "",
            expected: "ActorSystemConfig",
            value: input
        }, _errorFactory))(input, "$input", true);
    }
    return input;
}; })();
/** Validates thread pool options (worker count, script path). */
export const assertThreadPoolConfig = (() => { const _io0 = input => (undefined === input.poolSize || "number" === typeof input.poolSize && 1 <= input.poolSize) && (undefined === input.workerScript || "string" === typeof input.workerScript && 1 <= input.workerScript.length); const _ao0 = (input, _path, _exceptionable = true) => (undefined === input.poolSize || "number" === typeof input.poolSize && (1 <= input.poolSize || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".poolSize",
    expected: "number & Minimum<1>",
    value: input.poolSize
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".poolSize",
    expected: "((number & Minimum<1>) | undefined)",
    value: input.poolSize
}, _errorFactory)) && (undefined === input.workerScript || "string" === typeof input.workerScript && (1 <= input.workerScript.length || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".workerScript",
    expected: "string & MinLength<1>",
    value: input.workerScript
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".workerScript",
    expected: "((string & MinLength<1>) | undefined)",
    value: input.workerScript
}, _errorFactory)); const __is = input => "object" === typeof input && null !== input && false === Array.isArray(input) && _io0(input); let _errorFactory; return (input, errorFactory) => {
    if (false === __is(input)) {
        _errorFactory = errorFactory;
        ((input, _path, _exceptionable = true) => ("object" === typeof input && null !== input && false === Array.isArray(input) || __typia_transform__assertGuard._assertGuard(true, {
            method: "typia.createAssert",
            path: _path + "",
            expected: "ThreadPoolConfig",
            value: input
        }, _errorFactory)) && _ao0(input, _path + "", true) || __typia_transform__assertGuard._assertGuard(true, {
            method: "typia.createAssert",
            path: _path + "",
            expected: "ThreadPoolConfig",
            value: input
        }, _errorFactory))(input, "$input", true);
    }
    return input;
}; })();
/** Validates threaded actor factory references (module path + export name). */
export const assertThreadedProps = (() => { const _io0 = input => "string" === typeof input.behaviorModule && 1 <= input.behaviorModule.length && ("string" === typeof input.behaviorExport && 1 <= input.behaviorExport.length) && (undefined === input.behaviorArgs || Array.isArray(input.behaviorArgs)); const _ao0 = (input, _path, _exceptionable = true) => ("string" === typeof input.behaviorModule && (1 <= input.behaviorModule.length || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".behaviorModule",
    expected: "string & MinLength<1>",
    value: input.behaviorModule
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".behaviorModule",
    expected: "(string & MinLength<1>)",
    value: input.behaviorModule
}, _errorFactory)) && ("string" === typeof input.behaviorExport && (1 <= input.behaviorExport.length || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".behaviorExport",
    expected: "string & MinLength<1>",
    value: input.behaviorExport
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".behaviorExport",
    expected: "(string & MinLength<1>)",
    value: input.behaviorExport
}, _errorFactory)) && (undefined === input.behaviorArgs || Array.isArray(input.behaviorArgs) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".behaviorArgs",
    expected: "(Array<unknown> | undefined)",
    value: input.behaviorArgs
}, _errorFactory)); const __is = input => "object" === typeof input && null !== input && _io0(input); let _errorFactory; return (input, errorFactory) => {
    if (false === __is(input)) {
        _errorFactory = errorFactory;
        ((input, _path, _exceptionable = true) => ("object" === typeof input && null !== input || __typia_transform__assertGuard._assertGuard(true, {
            method: "typia.createAssert",
            path: _path + "",
            expected: "ThreadedProps",
            value: input
        }, _errorFactory)) && _ao0(input, _path + "", true) || __typia_transform__assertGuard._assertGuard(true, {
            method: "typia.createAssert",
            path: _path + "",
            expected: "ThreadedProps",
            value: input
        }, _errorFactory))(input, "$input", true);
    }
    return input;
}; })();
//# sourceMappingURL=validation.js.map