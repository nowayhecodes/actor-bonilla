import type { EventClassifier, EventSubscriber } from './types.js';
/**
 * EventStream provides a publish-subscribe mechanism for the actor system.
 *
 * Used for:
 *  - Dead letter notifications
 *  - Logging events
 *  - Custom application-level pub/sub
 */
export declare class EventStream {
    private subscribers;
    /**
     * Subscribe to events matching a classifier (topic).
     */
    subscribe<T>(classifier: EventClassifier, subscriber: EventSubscriber<T>): void;
    /**
     * Unsubscribe from a classifier.
     */
    unsubscribe<T>(classifier: EventClassifier, subscriber: EventSubscriber<T>): boolean;
    /**
     * Publish an event to all subscribers of the given classifier.
     */
    publish<T>(classifier: EventClassifier, event: T): void;
    /**
     * Check if any subscribers exist for a classifier.
     */
    hasSubscribers(classifier: EventClassifier): boolean;
    /**
     * Remove all subscribers.
     */
    clear(): void;
}
export declare const DEAD_LETTER_CHANNEL: EventClassifier;
export declare const LOG_CHANNEL: EventClassifier;
export declare const LIFECYCLE_CHANNEL: EventClassifier;
