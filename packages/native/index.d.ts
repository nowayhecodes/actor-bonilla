/**
 * Low-level Zig addon bindings.
 *
 * At runtime the loader (`index.js`) may export this API **or** a sentinel
 * `{ __actorBonillaNativeUnavailable: true }` when no prebuild exists — app
 * code should use `isNativeAvailable()` from `@actor-bonilla/core` instead of
 * importing this package directly.
 */
export interface NativeRegistry {
  readonly __brand: 'NativeRegistry';
}

export interface NativePool {
  readonly __brand: 'NativePool';
}

export type MailboxKind = 0 | 1 | 2; // 0=unbounded, 1=bounded, 2=priority

/**
 * Callback invoked by Zig when a message is ready for the JS receive handler.
 * @param actorId     The actor receiving the message
 * @param messageRef  The napi_ref wrapping the JS message value (user messages)
 * @param senderId    Sender actor ID (0 = no sender)
 * @param timestamp   Unix ms
 * @param messageId   Monotonic message ID
 * @param signalId    SystemSignal value (only valid when isSignal=true)
 * @param isSignal    True when this is a system signal, not a user message
 */
export type ReceiveCallback = (
  actorId: bigint,
  messageRef: unknown,
  senderId: bigint,
  timestamp: bigint,
  messageId: bigint,
  signalId: number,
  isSignal: boolean
) => void;

/**
 * Called on the JS thread when a Zig actor crashes.
 * JS must call nativeSendDirective with the chosen directive.
 */
export type SupervisionCallback = (actorId: bigint, errorMessage: string) => void;

export function nativeCreateRegistry(): NativeRegistry;
export function nativeDestroyRegistry(registry: NativeRegistry): void;
export function nativeCreatePool(registry: NativeRegistry, poolSize: number): NativePool;
export function nativeShutdownPool(pool: NativePool): void;
export function nativeRegisterActor(
  pool: NativePool,
  actorId: bigint,
  supervisorId: bigint,
  receiveCallback: ReceiveCallback,
  mailboxType: MailboxKind,
  capacity: number
): void;
export function nativeUnregisterActor(pool: NativePool, actorId: bigint): void;
export function nativeEnqueueMessage(
  pool: NativePool,
  actorId: bigint,
  message: unknown,
  senderId: bigint,
  timestamp: bigint,
  messageId: bigint
): void;
export function nativeEnqueueSignal(
  pool: NativePool,
  actorId: bigint,
  signalId: number,
  senderId: bigint
): void;
export function nativeGetMailboxSize(pool: NativePool, actorId: bigint): number;
export function nativeSetSupervisionCallback(
  pool: NativePool,
  callback: SupervisionCallback
): void;
export function nativeSendDirective(
  pool: NativePool,
  actorId: bigint,
  directive: number
): void;
