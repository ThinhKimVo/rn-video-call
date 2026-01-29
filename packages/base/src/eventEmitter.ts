import { VideoCallError } from './errors';

/**
 * Event types that can be emitted by the video call service.
 * MediaStream type is intentionally kept as unknown to avoid
 * coupling the base package to react-native-webrtc.
 */
export type VideoCallEvents = {
  localStream: unknown | undefined;
  remoteStream: unknown | undefined;
  gettingCall: boolean;
  isMuted: boolean;
  isFrontCamera: boolean;
  localCameraEnabled: boolean;
  remoteCameraEnabled: boolean;
  connectionState: 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';
  error: VideoCallError;
};

/**
 * Event listener type
 */
export type VideoCallEventListener<K extends keyof VideoCallEvents> = (data: VideoCallEvents[K]) => void;

/**
 * Unsubscribe function returned when subscribing to events
 */
export type EventUnsubscriber = () => void;

/**
 * Interface for the video call event emitter
 */
export interface IVideoCallEventEmitter {
  on<K extends keyof VideoCallEvents>(event: K, callback: VideoCallEventListener<K>): EventUnsubscriber;
  off<K extends keyof VideoCallEvents>(event: K, callback: VideoCallEventListener<K>): void;
  emit<K extends keyof VideoCallEvents>(event: K, data: VideoCallEvents[K]): void;
  removeAllListeners(event?: keyof VideoCallEvents): void;
}

/**
 * Type-safe event emitter for video call events.
 * Provides a clean way to communicate state changes from the service layer to the UI.
 */
export class VideoCallEventEmitter implements IVideoCallEventEmitter {
  private listeners: Map<keyof VideoCallEvents, Set<VideoCallEventListener<keyof VideoCallEvents>>> = new Map();

  /**
   * Subscribe to an event
   * @param event - The event type to listen for
   * @param callback - Function to call when the event is emitted
   * @returns Unsubscribe function
   */
  on<K extends keyof VideoCallEvents>(event: K, callback: VideoCallEventListener<K>): EventUnsubscriber {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    const eventListeners = this.listeners.get(event)!;
    eventListeners.add(callback as VideoCallEventListener<keyof VideoCallEvents>);

    // Return unsubscribe function
    return () => {
      this.off(event, callback);
    };
  }

  /**
   * Unsubscribe from an event
   * @param event - The event type
   * @param callback - The callback to remove
   */
  off<K extends keyof VideoCallEvents>(event: K, callback: VideoCallEventListener<K>): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(callback as VideoCallEventListener<keyof VideoCallEvents>);
    }
  }

  /**
   * Emit an event to all subscribers
   * @param event - The event type
   * @param data - The data to pass to listeners
   */
  emit<K extends keyof VideoCallEvents>(event: K, data: VideoCallEvents[K]): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach((callback) => {
        try {
          (callback as VideoCallEventListener<K>)(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Remove all listeners for a specific event or all events
   * @param event - Optional event type. If not provided, removes all listeners.
   */
  removeAllListeners(event?: keyof VideoCallEvents): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Get the number of listeners for an event
   * @param event - The event type
   * @returns Number of listeners
   */
  listenerCount(event: keyof VideoCallEvents): number {
    return this.listeners.get(event)?.size || 0;
  }

  /**
   * Check if there are any listeners for an event
   * @param event - The event type
   * @returns True if there are listeners
   */
  hasListeners(event: keyof VideoCallEvents): boolean {
    return this.listenerCount(event) > 0;
  }
}
