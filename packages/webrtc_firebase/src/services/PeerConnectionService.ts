import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  MediaStream,
} from "react-native-webrtc";
import { Logger, SubscriptionManager } from "@rn-video-call/base";
import { SessionConstraints, IceCandidateData } from "../webrtcFirebase.types";

/**
 * RTCPeerConnection configuration
 */
export const DEFAULT_PEER_CONSTRAINTS = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302",
    },
  ],
};

/**
 * Connection state type
 */
export type ConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

/**
 * Interface for peer connection service operations
 */
export interface IPeerConnectionService {
  create(config?: RTCConfiguration): RTCPeerConnection;
  addTrack(track: MediaStreamTrack, stream: MediaStream): void;
  createOffer(): Promise<RTCSessionDescriptionInit>;
  createAnswer(): Promise<RTCSessionDescriptionInit>;
  setLocalDescription(description: RTCSessionDescriptionInit): Promise<void>;
  setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void>;
  addIceCandidate(candidate: IceCandidateData): Promise<void>;
  close(): void;
  getConnectionState(): ConnectionState;
  onTrack(callback: (streams: MediaStream[]) => void): void;
  onIceCandidate(callback: (candidate: RTCIceCandidateInit | null) => void): void;
  onConnectionStateChange(callback: (state: ConnectionState) => void): void;
  getPeerConnection(): RTCPeerConnection | null;
  hasRemoteDescription(): boolean;
}

/**
 * Peer connection service for managing WebRTC connections.
 * Handles RTCPeerConnection lifecycle and events.
 */
export class PeerConnectionService implements IPeerConnectionService {
  private logger = Logger.getInstance('PeerConnectionService');
  private peerConnection: RTCPeerConnection | null = null;
  private subscriptionManager = new SubscriptionManager();
  private pendingCandidates: RTCIceCandidate[] = [];

  /**
   * Get the underlying RTCPeerConnection instance
   */
  getPeerConnection(): RTCPeerConnection | null {
    return this.peerConnection;
  }

  /**
   * Check if a remote description has been set
   */
  hasRemoteDescription(): boolean {
    return this.peerConnection?.remoteDescription != null;
  }

  /**
   * Create a new RTCPeerConnection
   */
  create(config: RTCConfiguration = DEFAULT_PEER_CONSTRAINTS): RTCPeerConnection {
    if (this.peerConnection) {
      this.close();
    }

    this.peerConnection = new RTCPeerConnection(config);
    this.logger.info('RTCPeerConnection created');
    return this.peerConnection;
  }

  /**
   * Add a media track to the peer connection
   */
  addTrack(track: MediaStreamTrack, stream: MediaStream): void {
    if (!this.peerConnection) {
      this.logger.warn('Cannot add track: no peer connection');
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.peerConnection.addTrack(track as any, stream);
  }

  /**
   * Create an SDP offer
   */
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) {
      throw new Error('No peer connection');
    }

    // react-native-webrtc uses legacy constraint format
    const sessionConstraints: SessionConstraints = {
      mandatory: {
        OfferToReceiveAudio: true,
        OfferToReceiveVideo: true,
        VoiceActivityDetection: true,
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const offer = await this.peerConnection.createOffer(sessionConstraints as any);
    this.logger.info('Offer created');
    return offer;
  }

  /**
   * Create an SDP answer
   */
  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) {
      throw new Error('No peer connection');
    }

    const answer = await this.peerConnection.createAnswer();
    this.logger.info('Answer created');
    return answer;
  }

  /**
   * Set the local description
   */
  async setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('No peer connection');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this.peerConnection.setLocalDescription(description as any);
    this.logger.info('Local description set');
  }

  /**
   * Set the remote description
   */
  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('No peer connection');
    }

    // Ensure required fields are present for react-native-webrtc
    if (!description.type || !description.sdp) {
      throw new Error('Invalid session description: missing type or sdp');
    }

    await this.peerConnection.setRemoteDescription(
      new RTCSessionDescription({ type: description.type, sdp: description.sdp })
    );
    this.logger.info('Remote description set');

    // Process any pending ICE candidates
    await this.processPendingCandidates();
  }

  /**
   * Add an ICE candidate
   */
  async addIceCandidate(candidateData: IceCandidateData): Promise<void> {
    const candidate = new RTCIceCandidate(candidateData);

    if (!this.peerConnection || !this.hasRemoteDescription()) {
      // Queue candidate if remote description not yet set
      this.pendingCandidates.push(candidate);
      this.logger.debug('ICE candidate queued (no remote description yet)');
      return;
    }

    await this.peerConnection.addIceCandidate(candidate);
    this.logger.debug('ICE candidate added');
  }

  /**
   * Process queued ICE candidates after remote description is set
   */
  private async processPendingCandidates(): Promise<void> {
    if (this.pendingCandidates.length === 0 || !this.peerConnection) {
      return;
    }

    this.logger.debug(`Processing ${this.pendingCandidates.length} pending ICE candidates`);

    await Promise.all(
      this.pendingCandidates.map(async (candidate) => {
        try {
          await this.peerConnection!.addIceCandidate(candidate);
        } catch (error) {
          this.logger.warn('Error adding pending ICE candidate:', error);
        }
      })
    );

    this.pendingCandidates = [];
  }

  /**
   * Close the peer connection
   */
  close(): void {
    if (!this.peerConnection) return;

    // Remove all event listeners
    this.subscriptionManager.removeEventListenersForKey('peerConnection');

    this.peerConnection.close();
    this.peerConnection = null;
    this.pendingCandidates = [];
    this.logger.info('RTCPeerConnection closed');
  }

  /**
   * Get the current connection state
   */
  getConnectionState(): ConnectionState {
    if (!this.peerConnection) return 'closed';

    const state = this.peerConnection.connectionState;
    switch (state) {
      case 'new':
        return 'new';
      case 'connecting':
        return 'connecting';
      case 'connected':
        return 'connected';
      case 'disconnected':
        return 'disconnected';
      case 'failed':
        return 'failed';
      case 'closed':
        return 'closed';
      default:
        return 'new';
    }
  }

  /**
   * Register a callback for track events
   */
  onTrack(callback: (streams: MediaStream[]) => void): void {
    if (!this.peerConnection) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = (event: any) => {
      callback(event.streams);
    };

    this.subscriptionManager.addEventListenerTracked(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.peerConnection as any,
      'track',
      handler as (...args: unknown[]) => void,
      'peerConnection'
    );
  }

  /**
   * Register a callback for ICE candidate events
   */
  onIceCandidate(callback: (candidate: RTCIceCandidateInit | null) => void): void {
    if (!this.peerConnection) return;

    const handler = (event: RTCPeerConnectionIceEvent) => {
      callback(event.candidate ? event.candidate.toJSON() : null);
    };

    this.subscriptionManager.addEventListenerTracked(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.peerConnection as any,
      'icecandidate',
      handler as (...args: unknown[]) => void,
      'peerConnection'
    );
  }

  /**
   * Register a callback for connection state changes
   */
  onConnectionStateChange(callback: (state: ConnectionState) => void): void {
    if (!this.peerConnection) return;

    const handler = () => {
      callback(this.getConnectionState());
    };

    this.subscriptionManager.addEventListenerTracked(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.peerConnection as any,
      'connectionstatechange',
      handler as (...args: unknown[]) => void,
      'peerConnection'
    );

    this.subscriptionManager.addEventListenerTracked(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.peerConnection as any,
      'iceconnectionstatechange',
      handler as (...args: unknown[]) => void,
      'peerConnection'
    );
  }
}
