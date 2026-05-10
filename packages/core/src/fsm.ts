// ============================================================================
// actor-bonilla — FSM (Finite State Machine)
// ============================================================================

import type { ActorContext, Receive, Props } from './types.js';

/**
 * State handler function — processes a message in a specific state.
 */
export type StateHandler<TState, TData, TMessage> = (
  message: TMessage,
  data: TData,
  fsm: FSMContext<TState, TData, TMessage>
) => StateResult<TState, TData>;

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
export type TransitionHandler<TState, TData> = (
  from: TState,
  to: TState,
  data: TData
) => void;

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
export class FSM<TState extends string | number | symbol, TData, TMessage> {
  private handlers = new Map<TState, StateHandler<TState, TData, TMessage>>();
  private transitionListeners: TransitionHandler<TState, TData>[] = [];
  private _initialState!: TState;
  private _initialData!: TData;
  private _stateTimeouts = new Map<TState, number>();

  static create<
    TState extends string | number | symbol,
    TData,
    TMessage,
  >(): FSM<TState, TData, TMessage> {
    return new FSM();
  }

  /** Set the initial state and data. */
  initialState(state: TState, data: TData): this {
    this._initialState = state;
    this._initialData = data;
    return this;
  }

  /** Register a handler for a state. */
  when(state: TState, handler: StateHandler<TState, TData, TMessage>): this {
    this.handlers.set(state, handler);
    return this;
  }

  /** Set a timeout for a specific state. */
  stateTimeout(state: TState, timeoutMs: number): this {
    this._stateTimeouts.set(state, timeoutMs);
    return this;
  }

  /** Register a transition listener. */
  onTransition(handler: TransitionHandler<TState, TData>): this {
    this.transitionListeners.push(handler);
    return this;
  }

  /** Build Props for the FSM actor. */
  build(): Props<TMessage> {
    const handlers = new Map(this.handlers);
    const transitionListeners = [...this.transitionListeners];
    const initialState = this._initialState;
    const initialData = this._initialData;
    const stateTimeouts = new Map(this._stateTimeouts);

    // Closure state
    let currentState: TState = initialState;
    let currentData: TData = initialData;
    let stateTimer: ReturnType<typeof setTimeout> | null = null;

    const STOP_SENTINEL = Symbol('FSM_STOP');

    const receive: Receive<TMessage> = (
      message: TMessage,
      context: ActorContext<TMessage>
    ) => {
      const handler = handlers.get(currentState);
      if (!handler) {
        console.warn(
          `[actor-bonilla/FSM] No handler for state "${String(currentState)}"`
        );
        return;
      }

      const fsmContext: FSMContext<TState, TData, TMessage> = {
        currentState,
        currentData,
        actorContext: context,
        stay: (data?: TData) => ({
          nextState: currentState,
          nextData: data ?? currentData,
        }),
        goto: (state: TState, data?: TData) => ({
          nextState: state,
          nextData: data ?? currentData,
        }),
        stop: () => ({
          nextState: STOP_SENTINEL as any,
          nextData: currentData,
        }),
      };

      const result = handler(message, currentData, fsmContext);

      if ((result.nextState as any) === STOP_SENTINEL) {
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
          } catch (e) {
            console.error('[actor-bonilla/FSM] Transition handler error:', e);
          }
        }

        // Handle state timeouts
        if (stateTimer !== null) {
          clearTimeout(stateTimer);
          stateTimer = null;
        }
        const timeout =
          result.stateTimeoutMs ?? stateTimeouts.get(currentState);
        if (timeout !== undefined) {
          stateTimer = setTimeout(() => {
            // Send a StateTimeout message (user can handle it)
            context.self.tell({
              type: '__FSM_STATE_TIMEOUT__',
              state: currentState,
            } as any);
          }, timeout);
        }
      }
    };

    return { receive };
  }
}
