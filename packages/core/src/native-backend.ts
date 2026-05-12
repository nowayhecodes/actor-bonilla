// native-backend.ts — loads the Zig native addon when available and
// provides NativePool adapter for direct integration with the actor system.

import { createRequire } from 'node:module';
import type { Envelope } from './types.js';
import {
  PreStart,
  PostStop,
  PreRestart,
  PostRestart,
  PoisonPill,
  Kill,
  ReceiveTimeout,
  Terminated,
} from './types.js';

// ============================================================================
// Signal symbol ↔ numeric ID mapping (must match signals.zig)
// ============================================================================

const SIGNAL_TO_ID = new Map<symbol, number>([
  [PreStart, 0],
  [PostStop, 1],
  [PreRestart, 2],
  [PostRestart, 3],
  [PoisonPill, 4],
  [Kill, 5],
  [ReceiveTimeout, 6],
  [Terminated, 7],
]);

const ID_TO_SIGNAL: symbol[] = [
  PreStart,
  PostStop,
  PreRestart,
  PostRestart,
  PoisonPill,
  Kill,
  ReceiveTimeout,
  Terminated,
];

// ============================================================================
// NativeAddon interface — matches index.d.ts in @actor-bonilla/native
// ============================================================================

export interface NativeAddon {
  nativeCreateRegistry(): unknown;
  nativeDestroyRegistry(registry: unknown): void;
  nativeCreatePool(registry: unknown, poolSize: number): unknown;
  nativeShutdownPool(pool: unknown): void;
  nativeRegisterActor(
    pool: unknown,
    actorId: bigint,
    supervisorId: bigint,
    receiveCallback: (
      actorId: bigint,
      messageRef: unknown,
      senderId: bigint,
      timestamp: bigint,
      messageId: bigint,
      signalId: number,
      isSignal: boolean
    ) => void,
    mailboxType: number,
    capacity: number
  ): void;
  nativeUnregisterActor(pool: unknown, actorId: bigint): void;
  nativeEnqueueMessage(
    pool: unknown,
    actorId: bigint,
    message: unknown,
    senderId: bigint,
    timestamp: bigint,
    messageId: bigint
  ): void;
  nativeEnqueueSignal(
    pool: unknown,
    actorId: bigint,
    signalId: number,
    senderId: bigint
  ): void;
  nativeGetMailboxSize(pool: unknown, actorId: bigint): number;
  nativeSetSupervisionCallback(
    pool: unknown,
    callback: (actorId: bigint, errorMessage: string) => void
  ): void;
  nativeSendDirective(pool: unknown, actorId: bigint, directive: number): void;
}

// ============================================================================
// Addon loading — graceful fallback when native binary is not present
// ============================================================================

const _require = createRequire(import.meta.url);

let _addon: NativeAddon | null = null;
let _addonLoaded = false;

function isLoadedNativeAddon(mod: unknown): mod is NativeAddon {
  return (
    typeof mod === 'object' &&
    mod !== null &&
    typeof (mod as NativeAddon).nativeCreateRegistry === 'function'
  );
}

function getAddon(): NativeAddon | null {
  if (_addonLoaded) return _addon;
  _addonLoaded = true;
  try {
    const mod = _require('@actor-bonilla/native');
    _addon = isLoadedNativeAddon(mod) ? mod : null;
  } catch {
    _addon = null;
  }
  return _addon;
}

export function isNativeAvailable(): boolean {
  return getAddon() !== null;
}

// ============================================================================
// Monotonic message ID counter
// ============================================================================

let _globalMessageId = 0n;

function nextMessageId(): bigint {
  _globalMessageId += 1n;
  return _globalMessageId;
}

// ============================================================================
// NativePool — wraps the Zig thread pool + registry lifecycle
// ============================================================================

export class NativePool {
  private readonly addon: NativeAddon;
  private readonly registryHandle: unknown;
  private readonly poolHandle: unknown;
  private readonly crashHandlers = new Map<bigint, (error: Error) => void>();

  constructor(poolSize?: number) {
    const addon = getAddon();
    if (!addon) {
      throw new Error(
        '[actor-bonilla] Native addon not available. ' +
          'Build it with: pnpm run build:native'
      );
    }
    this.addon = addon;
    this.registryHandle = addon.nativeCreateRegistry();

    const cpuCount =
      typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 4;
    const resolvedSize = poolSize ?? Math.max(cpuCount - 1, 1);
    this.poolHandle = addon.nativeCreatePool(this.registryHandle, resolvedSize);

    addon.nativeSetSupervisionCallback(
      this.poolHandle,
      (actorId: bigint, errorMessage: string) => {
        const handler = this.crashHandlers.get(actorId);
        if (handler) {
          handler(new Error(errorMessage));
        }
      }
    );
  }

  /**
   * Register an actor with the Zig runtime.
   *
   * @param actorId       Numeric actor ID (bigint).
   * @param supervisorId  Parent supervisor ID (0n = no supervisor).
   * @param onEnvelope    JS callback invoked on the V8 thread for each delivered envelope.
   * @param mailboxKind   0 = unbounded, 1 = bounded, 2 = priority.
   * @param capacity      Capacity hint for bounded mailboxes.
   * @param onCrash       Called when the Zig runtime reports a crash for this actor.
   */
  registerActor(
    actorId: bigint,
    supervisorId: bigint,
    onEnvelope: (envelope: Envelope<unknown>) => void,
    mailboxKind: 0 | 1 | 2,
    capacity: number,
    onCrash: (error: Error) => void
  ): void {
    this.crashHandlers.set(actorId, onCrash);

    this.addon.nativeRegisterActor(
      this.poolHandle,
      actorId,
      supervisorId,
      (
        _actorId: bigint,
        messageRef: unknown,
        senderId: bigint,
        timestamp: bigint,
        messageId: bigint,
        signalId: number,
        isSignal: boolean
      ) => {
        if (isSignal) {
          const signal = ID_TO_SIGNAL[signalId];
          if (signal !== undefined) {
            onEnvelope({
              message: signal as unknown as never,
              sender: null,
              timestamp: Number(timestamp),
              messageId: Number(messageId),
            });
          }
        } else {
          onEnvelope({
            message: messageRef,
            sender: null,
            timestamp: Number(timestamp),
            messageId: Number(messageId),
          });
        }
      },
      mailboxKind,
      capacity
    );
  }

  unregisterActor(actorId: bigint): void {
    this.crashHandlers.delete(actorId);
    this.addon.nativeUnregisterActor(this.poolHandle, actorId);
  }

  enqueueMessage(actorId: bigint, message: unknown, senderId: bigint): void {
    const now = BigInt(Date.now());
    const messageId = nextMessageId();
    this.addon.nativeEnqueueMessage(
      this.poolHandle,
      actorId,
      message,
      senderId,
      now,
      messageId
    );
  }

  enqueueSignal(actorId: bigint, signal: symbol, senderId: bigint): void {
    const signalId = SIGNAL_TO_ID.get(signal);
    if (signalId === undefined) return;
    this.addon.nativeEnqueueSignal(this.poolHandle, actorId, signalId, senderId);
  }

  getMailboxSize(actorId: bigint): number {
    return this.addon.nativeGetMailboxSize(this.poolHandle, actorId);
  }

  sendDirective(actorId: bigint, directive: number): void {
    this.addon.nativeSendDirective(this.poolHandle, actorId, directive);
  }

  shutdown(): void {
    this.addon.nativeShutdownPool(this.poolHandle);
    this.addon.nativeDestroyRegistry(this.registryHandle);
  }
}
