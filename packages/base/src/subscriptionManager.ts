/**
 * Unsubscribe function type for Firestore listeners and other subscriptions
 */
export type Unsubscriber = () => void;

/**
 * Generic interface for objects that can have event listeners
 * Compatible with both standard EventTarget and react-native-webrtc types
 */
interface EventEmitterLike {
  addEventListener(type: string, listener: (...args: unknown[]) => void): void;
  removeEventListener(type: string, listener: (...args: unknown[]) => void): void;
}

/**
 * Tracked event listener information for cleanup
 */
interface TrackedEventListener {
  target: EventEmitterLike;
  type: string;
  listener: (...args: unknown[]) => void;
}

/**
 * Manages subscriptions and event listeners with unified cleanup.
 * Prevents memory leaks by tracking all subscriptions and providing
 * a single cleanup method to remove them all.
 */
export class SubscriptionManager {
  private subscriptions: Map<string, Unsubscriber> = new Map();
  private eventListeners: Map<string, TrackedEventListener[]> = new Map();

  /**
   * Add a subscription (e.g., Firestore onSnapshot) with a unique key.
   * If a subscription with the same key exists, it will be unsubscribed first.
   */
  addSubscription(key: string, unsubscribe: Unsubscriber): void {
    // Unsubscribe existing subscription with same key to prevent duplicates
    this.removeSubscription(key);
    this.subscriptions.set(key, unsubscribe);
  }

  /**
   * Remove and unsubscribe a specific subscription by key.
   */
  removeSubscription(key: string): void {
    const unsubscribe = this.subscriptions.get(key);
    if (unsubscribe) {
      try {
        unsubscribe();
      } catch {
        // Ignore errors during unsubscribe (may already be cleaned up)
      }
      this.subscriptions.delete(key);
    }
  }

  /**
   * Check if a subscription exists for a given key.
   */
  hasSubscription(key: string): boolean {
    return this.subscriptions.has(key);
  }

  /**
   * Add an event listener to a target and track it for cleanup.
   * Compatible with standard EventTarget and react-native-webrtc types.
   * @param target - Object with addEventListener/removeEventListener methods
   * @param type - Event type (e.g., 'icecandidate')
   * @param listener - The event listener function
   * @param key - A grouping key for batch removal (e.g., 'peerConnection')
   */
  addEventListenerTracked(
    target: EventEmitterLike,
    type: string,
    listener: (...args: unknown[]) => void,
    key: string
  ): void {
    target.addEventListener(type, listener);

    const existing = this.eventListeners.get(key) || [];
    existing.push({ target, type, listener });
    this.eventListeners.set(key, existing);
  }

  /**
   * Remove all event listeners for a specific key.
   */
  removeEventListenersForKey(key: string): void {
    const listeners = this.eventListeners.get(key);
    if (listeners) {
      for (const { target, type, listener } of listeners) {
        try {
          target.removeEventListener(type, listener);
        } catch {
          // Ignore errors during removal (target may be closed)
        }
      }
      this.eventListeners.delete(key);
    }
  }

  /**
   * Get the count of tracked event listeners for a key.
   */
  getEventListenerCount(key: string): number {
    return this.eventListeners.get(key)?.length || 0;
  }

  /**
   * Cleanup all subscriptions and event listeners.
   * Call this when the component unmounts or the service is reset.
   */
  cleanup(): void {
    // Unsubscribe all Firestore listeners
    for (const [key] of this.subscriptions) {
      this.removeSubscription(key);
    }

    // Remove all event listeners
    for (const [key] of this.eventListeners) {
      this.removeEventListenersForKey(key);
    }
  }

  /**
   * Get the total number of active subscriptions.
   */
  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  /**
   * Get all subscription keys (useful for debugging).
   */
  getSubscriptionKeys(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  /**
   * Get all event listener keys (useful for debugging).
   */
  getEventListenerKeys(): string[] {
    return Array.from(this.eventListeners.keys());
  }
}
