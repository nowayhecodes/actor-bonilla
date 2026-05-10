// ============================================================================
// @actor-bonilla/http — Cache actor (stateful cache via ActorSystem)
//
// Uses `ask` to retrieve entries so the calling code awaits a response.
// Stores and retrieves CacheEntry records via an injected CacheStore.
// Multiple HttpClient instances that share the same ActorSystem share cache
// state through this single actor.
// ============================================================================
import { props, AskReply } from '@actor-bonilla/core';
// ─── Reply helper ─────────────────────────────────────────────────────────────
/**
 * Sends an ask-reply back to the caller.  `message` is the raw received
 * message (may have `__askReplyTo` and `__askCorrelationId` injected by the
 * ask pattern).  Falls back to `context.sender.tell` when not an ask call.
 */
function sendReply(context, message, value) {
    const msg = message;
    if (msg['__askReplyTo']) {
        const replyTo = msg['__askReplyTo'];
        replyTo.tell({
            signal: AskReply,
            correlationId: msg['__askCorrelationId'] ?? 0,
            value,
        });
    }
    else {
        context.sender?.tell(value);
    }
}
// ─── Behavior factory ─────────────────────────────────────────────────────────
export function createCacheBehavior(store) {
    return async (message, context) => {
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
export function cacheActorProps(store) {
    return props(createCacheBehavior(store));
}
//# sourceMappingURL=cache.js.map