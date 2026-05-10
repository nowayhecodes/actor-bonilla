// ============================================================================
// @actor-bonilla/http — Cache actor (stateful cache via ActorSystem)
//
// Uses `ask` to retrieve entries so the calling code awaits a response.
// Stores and retrieves CacheEntry records via an injected CacheStore.
// Multiple HttpClient instances that share the same ActorSystem share cache
// state through this single actor.
// ============================================================================

import { props, AskReply, type Receive, type ActorContext } from '@actor-bonilla/core';
import type { CacheEntry, CacheStore } from '../types.js';

// ─── Messages ─────────────────────────────────────────────────────────────────

export type CacheMsg =
  | { readonly type: 'GET'; readonly key: string }
  | { readonly type: 'SET'; readonly key: string; readonly entry: CacheEntry; readonly ttl?: number }
  | { readonly type: 'DELETE'; readonly key: string }
  | { readonly type: 'CLEAR' };

// ─── Reply helper ─────────────────────────────────────────────────────────────

/**
 * Sends an ask-reply back to the caller.  `message` is the raw received
 * message (may have `__askReplyTo` and `__askCorrelationId` injected by the
 * ask pattern).  Falls back to `context.sender.tell` when not an ask call.
 */
function sendReply<R>(
  context: ActorContext<CacheMsg>,
  message: CacheMsg,
  value: R
): void {
  const msg = message as Record<string, unknown>;
  if (msg['__askReplyTo']) {
    const replyTo = msg['__askReplyTo'] as { tell: (v: unknown) => void };
    replyTo.tell({
      signal: AskReply,
      correlationId: msg['__askCorrelationId'] ?? 0,
      value,
    });
  } else {
    context.sender?.tell(value as never);
  }
}

// ─── Behavior factory ─────────────────────────────────────────────────────────

export function createCacheBehavior(store: CacheStore): Receive<CacheMsg> {
  return async (message: CacheMsg, context: ActorContext<CacheMsg>) => {
    switch (message.type) {
      case 'GET': {
        const entry = await Promise.resolve(store.get(message.key));
        sendReply(context, message, entry ?? null);
        break;
      }
      case 'SET': {
        await Promise.resolve(store.set(message.key, message.entry, message.ttl));
        break;
      }
      case 'DELETE': {
        await Promise.resolve(store.delete(message.key));
        break;
      }
      case 'CLEAR': {
        await Promise.resolve(store.clear?.());
        break;
      }
    }
  };
}

/** Props factory for the cache actor. */
export function cacheActorProps(store: CacheStore) {
  return props<CacheMsg>(createCacheBehavior(store));
}
