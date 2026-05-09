// ============================================================================
// actor-bonilla — EventStream
// Publish-subscribe event bus for system-wide events and user events.
// ============================================================================
/**
 * EventStream provides a publish-subscribe mechanism for the actor system.
 *
 * Used for:
 *  - Dead letter notifications
 *  - Logging events
 *  - Custom application-level pub/sub
 */ export class EventStream {
    subscribers = new Map();
    /**
   * Subscribe to events matching a classifier (topic).
   */ subscribe(classifier, subscriber) {
        let subs = this.subscribers.get(classifier);
        if (!subs) {
            subs = new Set();
            this.subscribers.set(classifier, subs);
        }
        subs.add(subscriber);
    }
    /**
   * Unsubscribe from a classifier.
   */ unsubscribe(classifier, subscriber) {
        const subs = this.subscribers.get(classifier);
        if (!subs) return false;
        const result = subs.delete(subscriber);
        if (subs.size === 0) this.subscribers.delete(classifier);
        return result;
    }
    /**
   * Publish an event to all subscribers of the given classifier.
   */ publish(classifier, event) {
        const subs = this.subscribers.get(classifier);
        if (!subs) return;
        for (const sub of subs){
            try {
                sub(event);
            } catch (e) {
                console.error(`[actor-bonilla] Error in event subscriber for "${String(classifier)}":`, e);
            }
        }
    }
    /**
   * Check if any subscribers exist for a classifier.
   */ hasSubscribers(classifier) {
        const subs = this.subscribers.get(classifier);
        return subs !== undefined && subs.size > 0;
    }
    /**
   * Remove all subscribers.
   */ clear() {
        this.subscribers.clear();
    }
}
// Well-known event classifiers
export const DEAD_LETTER_CHANNEL = Symbol.for('actor-bonilla.deadLetters');
export const LOG_CHANNEL = Symbol.for('actor-bonilla.log');
export const LIFECYCLE_CHANNEL = Symbol.for('actor-bonilla.lifecycle');
