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
export class FSM {
    handlers = new Map();
    transitionListeners = [];
    _initialState;
    _initialData;
    _stateTimeouts = new Map();
    static create() {
        return new FSM();
    }
    /** Set the initial state and data. */
    initialState(state, data) {
        this._initialState = state;
        this._initialData = data;
        return this;
    }
    /** Register a handler for a state. */
    when(state, handler) {
        this.handlers.set(state, handler);
        return this;
    }
    /** Set a timeout for a specific state. */
    stateTimeout(state, timeoutMs) {
        this._stateTimeouts.set(state, timeoutMs);
        return this;
    }
    /** Register a transition listener. */
    onTransition(handler) {
        this.transitionListeners.push(handler);
        return this;
    }
    /** Build Props for the FSM actor. */
    build() {
        const handlers = new Map(this.handlers);
        const transitionListeners = [...this.transitionListeners];
        const initialState = this._initialState;
        const initialData = this._initialData;
        const stateTimeouts = new Map(this._stateTimeouts);
        // Closure state
        let currentState = initialState;
        let currentData = initialData;
        let stateTimer = null;
        const STOP_SENTINEL = Symbol('FSM_STOP');
        const receive = (message, context) => {
            const handler = handlers.get(currentState);
            if (!handler) {
                console.warn(`[actor-bonilla/FSM] No handler for state "${String(currentState)}"`);
                return;
            }
            const fsmContext = {
                currentState,
                currentData,
                actorContext: context,
                stay: (data) => ({
                    nextState: currentState,
                    nextData: data ?? currentData,
                }),
                goto: (state, data) => ({
                    nextState: state,
                    nextData: data ?? currentData,
                }),
                stop: () => ({
                    nextState: STOP_SENTINEL,
                    nextData: currentData,
                }),
            };
            const result = handler(message, currentData, fsmContext);
            if (result.nextState === STOP_SENTINEL) {
                context.self.stop();
                return;
            }
            const oldState = currentState;
            currentState = result.nextState;
            currentData = result.nextData;
            // Fire transition listeners if state changed
            if (oldState !== currentState) {
                for (const listener of transitionListeners) {
                    try {
                        listener(oldState, currentState, currentData);
                    }
                    catch (e) {
                        console.error('[actor-bonilla/FSM] Transition handler error:', e);
                    }
                }
                // Handle state timeouts
                if (stateTimer !== null) {
                    clearTimeout(stateTimer);
                    stateTimer = null;
                }
                const timeout = result.stateTimeoutMs ?? stateTimeouts.get(currentState);
                if (timeout !== undefined) {
                    stateTimer = setTimeout(() => {
                        // Send a StateTimeout message (user can handle it)
                        context.self.tell({
                            type: '__FSM_STATE_TIMEOUT__',
                            state: currentState,
                        });
                    }, timeout);
                }
            }
        };
        return { receive };
    }
}
//# sourceMappingURL=fsm.js.map