import * as __typia_transform__assertGuard from "typia/lib/internal/_assertGuard";
import * as __typia_transform__accessExpressionAsString from "typia/lib/internal/_accessExpressionAsString";
// ============================================================================
// actor-bonilla — Runtime validation (Typia)
// ============================================================================
import typia from 'typia';
/**
 * Validates user-supplied actor system options before construction.
 * Uses `assertEquals` to reject objects with unknown extra properties.
 */
export const assertActorSystemConfig = (() => { const _io0 = (input, _exceptionable = true) => (undefined === input.name || "string" === typeof input.name && 1 <= input.name.length) && (undefined === input.defaultThroughput || "number" === typeof input.defaultThroughput && 1 <= input.defaultThroughput) && (undefined === input.logDeadLetters || "boolean" === typeof input.logDeadLetters) && (undefined === input.maxDeadLettersLogged || "number" === typeof input.maxDeadLettersLogged && 0 <= input.maxDeadLettersLogged) && (0 === Object.keys(input).length || Object.keys(input).every(key => {
    if (["name", "defaultThroughput", "logDeadLetters", "maxDeadLettersLogged"].some(prop => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return false;
})); const _ao0 = (input, _path, _exceptionable = true) => (undefined === input.name || "string" === typeof input.name && (1 <= input.name.length || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".name",
    expected: "string & MinLength<1>",
    value: input.name
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".name",
    expected: "((string & MinLength<1>) | undefined)",
    value: input.name
}, _errorFactory)) && (undefined === input.defaultThroughput || "number" === typeof input.defaultThroughput && (1 <= input.defaultThroughput || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".defaultThroughput",
    expected: "number & Minimum<1>",
    value: input.defaultThroughput
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".defaultThroughput",
    expected: "((number & Minimum<1>) | undefined)",
    value: input.defaultThroughput
}, _errorFactory)) && (undefined === input.logDeadLetters || "boolean" === typeof input.logDeadLetters || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".logDeadLetters",
    expected: "(boolean | undefined)",
    value: input.logDeadLetters
}, _errorFactory)) && (undefined === input.maxDeadLettersLogged || "number" === typeof input.maxDeadLettersLogged && (0 <= input.maxDeadLettersLogged || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".maxDeadLettersLogged",
    expected: "number & Minimum<0>",
    value: input.maxDeadLettersLogged
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".maxDeadLettersLogged",
    expected: "((number & Minimum<0>) | undefined)",
    value: input.maxDeadLettersLogged
}, _errorFactory)) && (0 === Object.keys(input).length || (false === _exceptionable || Object.keys(input).every(key => {
    if (["name", "defaultThroughput", "logDeadLetters", "maxDeadLettersLogged"].some(prop => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return __typia_transform__assertGuard._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + __typia_transform__accessExpressionAsString._accessExpressionAsString(key),
        expected: "undefined",
        value: value
    }, _errorFactory);
}))); const __is = (input, _exceptionable = true) => "object" === typeof input && null !== input && false === Array.isArray(input) && _io0(input, true); let _errorFactory; return (input, errorFactory) => {
    if (false === __is(input)) {
        _errorFactory = errorFactory;
        ((input, _path, _exceptionable = true) => ("object" === typeof input && null !== input && false === Array.isArray(input) || __typia_transform__assertGuard._assertGuard(true, {
            method: "typia.createAssertEquals",
            path: _path + "",
            expected: "ActorSystemConfig",
            value: input
        }, _errorFactory)) && _ao0(input, _path + "", true) || __typia_transform__assertGuard._assertGuard(true, {
            method: "typia.createAssertEquals",
            path: _path + "",
            expected: "ActorSystemConfig",
            value: input
        }, _errorFactory))(input, "$input", true);
    }
    return input;
}; })();
/**
 * Validates thread pool options (worker count, script path).
 * Uses `assertEquals` to reject objects with unknown extra properties.
 */
export const assertThreadPoolConfig = (() => { const _io0 = (input, _exceptionable = true) => (undefined === input.poolSize || "number" === typeof input.poolSize && 1 <= input.poolSize) && (undefined === input.workerScript || "string" === typeof input.workerScript && 1 <= input.workerScript.length) && (0 === Object.keys(input).length || Object.keys(input).every(key => {
    if (["poolSize", "workerScript"].some(prop => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return false;
})); const _ao0 = (input, _path, _exceptionable = true) => (undefined === input.poolSize || "number" === typeof input.poolSize && (1 <= input.poolSize || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".poolSize",
    expected: "number & Minimum<1>",
    value: input.poolSize
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".poolSize",
    expected: "((number & Minimum<1>) | undefined)",
    value: input.poolSize
}, _errorFactory)) && (undefined === input.workerScript || "string" === typeof input.workerScript && (1 <= input.workerScript.length || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".workerScript",
    expected: "string & MinLength<1>",
    value: input.workerScript
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".workerScript",
    expected: "((string & MinLength<1>) | undefined)",
    value: input.workerScript
}, _errorFactory)) && (0 === Object.keys(input).length || (false === _exceptionable || Object.keys(input).every(key => {
    if (["poolSize", "workerScript"].some(prop => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return __typia_transform__assertGuard._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + __typia_transform__accessExpressionAsString._accessExpressionAsString(key),
        expected: "undefined",
        value: value
    }, _errorFactory);
}))); const __is = (input, _exceptionable = true) => "object" === typeof input && null !== input && false === Array.isArray(input) && _io0(input, true); let _errorFactory; return (input, errorFactory) => {
    if (false === __is(input)) {
        _errorFactory = errorFactory;
        ((input, _path, _exceptionable = true) => ("object" === typeof input && null !== input && false === Array.isArray(input) || __typia_transform__assertGuard._assertGuard(true, {
            method: "typia.createAssertEquals",
            path: _path + "",
            expected: "ThreadPoolConfig",
            value: input
        }, _errorFactory)) && _ao0(input, _path + "", true) || __typia_transform__assertGuard._assertGuard(true, {
            method: "typia.createAssertEquals",
            path: _path + "",
            expected: "ThreadPoolConfig",
            value: input
        }, _errorFactory))(input, "$input", true);
    }
    return input;
}; })();
/**
 * Validates threaded actor factory references (module path + export name).
 * Uses `assertEquals` to reject objects with unknown extra properties.
 */
export const assertThreadedProps = (() => { const _io0 = (input, _exceptionable = true) => "string" === typeof input.behaviorModule && 1 <= input.behaviorModule.length && ("string" === typeof input.behaviorExport && 1 <= input.behaviorExport.length) && (undefined === input.behaviorArgs || Array.isArray(input.behaviorArgs)) && (2 === Object.keys(input).length || Object.keys(input).every(key => {
    if (["behaviorModule", "behaviorExport", "behaviorArgs"].some(prop => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return false;
})); const _ao0 = (input, _path, _exceptionable = true) => ("string" === typeof input.behaviorModule && (1 <= input.behaviorModule.length || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".behaviorModule",
    expected: "string & MinLength<1>",
    value: input.behaviorModule
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".behaviorModule",
    expected: "(string & MinLength<1>)",
    value: input.behaviorModule
}, _errorFactory)) && ("string" === typeof input.behaviorExport && (1 <= input.behaviorExport.length || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".behaviorExport",
    expected: "string & MinLength<1>",
    value: input.behaviorExport
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".behaviorExport",
    expected: "(string & MinLength<1>)",
    value: input.behaviorExport
}, _errorFactory)) && (undefined === input.behaviorArgs || Array.isArray(input.behaviorArgs) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssertEquals",
    path: _path + ".behaviorArgs",
    expected: "(Array<unknown> | undefined)",
    value: input.behaviorArgs
}, _errorFactory)) && (2 === Object.keys(input).length || (false === _exceptionable || Object.keys(input).every(key => {
    if (["behaviorModule", "behaviorExport", "behaviorArgs"].some(prop => key === prop))
        return true;
    const value = input[key];
    if (undefined === value)
        return true;
    return __typia_transform__assertGuard._assertGuard(_exceptionable, {
        method: "typia.createAssertEquals",
        path: _path + __typia_transform__accessExpressionAsString._accessExpressionAsString(key),
        expected: "undefined",
        value: value
    }, _errorFactory);
}))); const __is = (input, _exceptionable = true) => "object" === typeof input && null !== input && _io0(input, true); let _errorFactory; return (input, errorFactory) => {
    if (false === __is(input)) {
        _errorFactory = errorFactory;
        ((input, _path, _exceptionable = true) => ("object" === typeof input && null !== input || __typia_transform__assertGuard._assertGuard(true, {
            method: "typia.createAssertEquals",
            path: _path + "",
            expected: "ThreadedProps",
            value: input
        }, _errorFactory)) && _ao0(input, _path + "", true) || __typia_transform__assertGuard._assertGuard(true, {
            method: "typia.createAssertEquals",
            path: _path + "",
            expected: "ThreadedProps",
            value: input
        }, _errorFactory))(input, "$input", true);
    }
    return input;
}; })();
/**
 * Validates a supervision strategy object.
 * Ensures `maxRetries >= 0`, `withinMs >= 0`, and `type` is a valid literal.
 * The `decider` function property is type-checked (`typeof === 'function'`).
 */
export const assertSupervisionStrategy = (() => { const _io0 = input => ("one-for-one" === input.type || "all-for-one" === input.type) && ("number" === typeof input.maxRetries && 0 <= input.maxRetries) && ("number" === typeof input.withinMs && 0 <= input.withinMs) && true; const _ao0 = (input, _path, _exceptionable = true) => ("one-for-one" === input.type || "all-for-one" === input.type || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".type",
    expected: "(\"all-for-one\" | \"one-for-one\")",
    value: input.type
}, _errorFactory)) && ("number" === typeof input.maxRetries && (0 <= input.maxRetries || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".maxRetries",
    expected: "number & Minimum<0>",
    value: input.maxRetries
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".maxRetries",
    expected: "(number & Minimum<0>)",
    value: input.maxRetries
}, _errorFactory)) && ("number" === typeof input.withinMs && (0 <= input.withinMs || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".withinMs",
    expected: "number & Minimum<0>",
    value: input.withinMs
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".withinMs",
    expected: "(number & Minimum<0>)",
    value: input.withinMs
}, _errorFactory)) && (true || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".decider",
    expected: "unknown",
    value: input.decider
}, _errorFactory)); const __is = input => "object" === typeof input && null !== input && _io0(input); let _errorFactory; return (input, errorFactory) => {
    if (false === __is(input)) {
        _errorFactory = errorFactory;
        ((input, _path, _exceptionable = true) => ("object" === typeof input && null !== input || __typia_transform__assertGuard._assertGuard(true, {
            method: "typia.createAssert",
            path: _path + "",
            expected: "SupervisionStrategy",
            value: input
        }, _errorFactory)) && _ao0(input, _path + "", true) || __typia_transform__assertGuard._assertGuard(true, {
            method: "typia.createAssert",
            path: _path + "",
            expected: "SupervisionStrategy",
            value: input
        }, _errorFactory))(input, "$input", true);
    }
    return input;
}; })();
/**
 * Validates a router configuration object.
 * Ensures `nrOfInstances >= 1` and `strategy` is a valid `RoutingStrategy`.
 * The `props.receive` function is type-checked (`typeof === 'function'`).
 */
export const assertRouterConfig = (() => { const _io0 = input => ("round-robin" === input.strategy || "random" === input.strategy || "smallest-mailbox" === input.strategy || "broadcast" === input.strategy || "consistent-hash" === input.strategy) && ("number" === typeof input.nrOfInstances && 1 <= input.nrOfInstances) && ("object" === typeof input.props && null !== input.props && _io1(input.props)); const _io1 = input => true && (undefined === input.supervisionStrategy || "object" === typeof input.supervisionStrategy && null !== input.supervisionStrategy && _io2(input.supervisionStrategy)) && (undefined === input.mailboxType || "default" === input.mailboxType || "bounded" === input.mailboxType || "priority" === input.mailboxType) && (undefined === input.dispatcherType || "default" === input.dispatcherType || "pinned" === input.dispatcherType || "calling-thread" === input.dispatcherType); const _io2 = input => ("one-for-one" === input.type || "all-for-one" === input.type) && ("number" === typeof input.maxRetries && 0 <= input.maxRetries) && ("number" === typeof input.withinMs && 0 <= input.withinMs) && true; const _ao0 = (input, _path, _exceptionable = true) => ("round-robin" === input.strategy || "random" === input.strategy || "smallest-mailbox" === input.strategy || "broadcast" === input.strategy || "consistent-hash" === input.strategy || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".strategy",
    expected: "(\"broadcast\" | \"consistent-hash\" | \"random\" | \"round-robin\" | \"smallest-mailbox\")",
    value: input.strategy
}, _errorFactory)) && ("number" === typeof input.nrOfInstances && (1 <= input.nrOfInstances || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".nrOfInstances",
    expected: "number & Minimum<1>",
    value: input.nrOfInstances
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".nrOfInstances",
    expected: "(number & Minimum<1>)",
    value: input.nrOfInstances
}, _errorFactory)) && (("object" === typeof input.props && null !== input.props || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".props",
    expected: "Props<any>",
    value: input.props
}, _errorFactory)) && _ao1(input.props, _path + ".props", true && _exceptionable) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".props",
    expected: "Props<any>",
    value: input.props
}, _errorFactory)); const _ao1 = (input, _path, _exceptionable = true) => (true || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".receive",
    expected: "unknown",
    value: input.receive
}, _errorFactory)) && (undefined === input.supervisionStrategy || ("object" === typeof input.supervisionStrategy && null !== input.supervisionStrategy || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".supervisionStrategy",
    expected: "(SupervisionStrategy | undefined)",
    value: input.supervisionStrategy
}, _errorFactory)) && _ao2(input.supervisionStrategy, _path + ".supervisionStrategy", true && _exceptionable) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".supervisionStrategy",
    expected: "(SupervisionStrategy | undefined)",
    value: input.supervisionStrategy
}, _errorFactory)) && (undefined === input.mailboxType || "default" === input.mailboxType || "bounded" === input.mailboxType || "priority" === input.mailboxType || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".mailboxType",
    expected: "(\"bounded\" | \"default\" | \"priority\" | undefined)",
    value: input.mailboxType
}, _errorFactory)) && (undefined === input.dispatcherType || "default" === input.dispatcherType || "pinned" === input.dispatcherType || "calling-thread" === input.dispatcherType || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".dispatcherType",
    expected: "(\"calling-thread\" | \"default\" | \"pinned\" | undefined)",
    value: input.dispatcherType
}, _errorFactory)); const _ao2 = (input, _path, _exceptionable = true) => ("one-for-one" === input.type || "all-for-one" === input.type || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".type",
    expected: "(\"all-for-one\" | \"one-for-one\")",
    value: input.type
}, _errorFactory)) && ("number" === typeof input.maxRetries && (0 <= input.maxRetries || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".maxRetries",
    expected: "number & Minimum<0>",
    value: input.maxRetries
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".maxRetries",
    expected: "(number & Minimum<0>)",
    value: input.maxRetries
}, _errorFactory)) && ("number" === typeof input.withinMs && (0 <= input.withinMs || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".withinMs",
    expected: "number & Minimum<0>",
    value: input.withinMs
}, _errorFactory)) || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".withinMs",
    expected: "(number & Minimum<0>)",
    value: input.withinMs
}, _errorFactory)) && (true || __typia_transform__assertGuard._assertGuard(_exceptionable, {
    method: "typia.createAssert",
    path: _path + ".decider",
    expected: "unknown",
    value: input.decider
}, _errorFactory)); const __is = input => "object" === typeof input && null !== input && _io0(input); let _errorFactory; return (input, errorFactory) => {
    if (false === __is(input)) {
        _errorFactory = errorFactory;
        ((input, _path, _exceptionable = true) => ("object" === typeof input && null !== input || __typia_transform__assertGuard._assertGuard(true, {
            method: "typia.createAssert",
            path: _path + "",
            expected: "RouterConfig",
            value: input
        }, _errorFactory)) && _ao0(input, _path + "", true) || __typia_transform__assertGuard._assertGuard(true, {
            method: "typia.createAssert",
            path: _path + "",
            expected: "RouterConfig",
            value: input
        }, _errorFactory))(input, "$input", true);
    }
    return input;
}; })();
//# sourceMappingURL=validation.js.map