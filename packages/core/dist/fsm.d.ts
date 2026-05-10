import type { ActorContext, Props } from './types.js';
/**
 * State handler function — processes a message in a specific state.
 */
export type StateHandler<TState, TData, TMessage> = (message: TMessage, data: TData, fsm: FSMContext<TState, TData, TMessage>) => StateResult<TState, TData>;
/**
 * Result of processing a message in an FSM state.
 */
export interface StateResult<TState, TData> {
    /** Next state to transition to. Use `stay()` to remain. */
    nextState: TState;
    /** Updated data. */
    nextData: TData;
    /** Optional timeout for the next state. */
    stateTimeoutMs?: number;
}
/**
 * FSM context available during state processing.
 */
export interface FSMContext<TState, TData, TMessage> {
    readonly currentState: TState;
    readonly currentData: TData;
    readonly actorContext: ActorContext<TMessage>;
    /** Convenience: stay in the current state with optionally updated data. */
    stay(data?: TData): StateResult<TState, TData>;
    /** Convenience: transition to a new state. */
    goto(state: TState, data?: TData): StateResult<TState, TData>;
    /** Convenience: stop the FSM actor. */
    stop(): StateResult<TState, TData>;
}
/**
 * Transition listener called on every state change.
 */
export type TransitionHandler<TState, TData> = (from: TState, to: TState, data: TData) => void;
/**
 * Builder for FSM actors — declarative state handlers and transitions.
 *
 * Usage:
 * ```ts
 * const fsmProps = FSM.create<'idle' | 'active', number, MyMessage>()
 *   .initialState('idle', 0)
 *   .when('idle', (msg, data, fsm) => {
 *     if (msg.type === 'activate') return fsm.goto('active', data + 1);
 *     return fsm.stay();
 *   })
 *   .when('active', (msg, data, fsm) => {
 *     if (msg.type === 'deactivate') return fsm.goto('idle', data);
 *     return fsm.stay();
 *   })
 *   .onTransition((from, to, data) => console.log(`${from} -> ${to}`))
 *   .build();
 * ```
 */
export declare class FSM<TState extends string | number | symbol, TData, TMessage> {
    private handlers;
    private transitionListeners;
    private _initialState;
    private _initialData;
    private _stateTimeouts;
    /**
     * Create a new FSM builder with explicit type parameters.
     * @example
     * ```ts
     * const builder = FSM.create<'idle' | 'running', number, MyMsg>();
     * ```
     */
    static create<TState extends string | number | symbol, TData, TMessage>(): FSM<TState, TData, TMessage>;
    /** Set the initial state and data. */
    initialState(state: TState, data: TData): this;
    /** Register a handler for a state. */
    when(state: TState, handler: StateHandler<TState, TData, TMessage>): this;
    /** Set a timeout for a specific state. */
    stateTimeout(state: TState, timeoutMs: number): this;
    /** Register a transition listener. */
    onTransition(handler: TransitionHandler<TState, TData>): this;
    /** Build Props for the FSM actor. */
    build(): Props<TMessage>;
}
