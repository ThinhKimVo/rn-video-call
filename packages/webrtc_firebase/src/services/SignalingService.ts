import firestore, { FirebaseFirestoreTypes } from "@react-native-firebase/firestore";
import { RTCSessionDescription } from "react-native-webrtc";
import { COLLECTION_PATHS, Logger, VideoCallError, VideoCallErrorType, SubscriptionManager, Unsubscriber } from "@rn-video-call/base";
import { FireStoreCollection, IUserInfo } from "@rn-video-call/firebase_user";
import { UserDocumentData, IceCandidateData } from "../webrtcFirebase.types";

/**
 * Interface for signaling service operations
 */
export interface ISignalingService {
  initialize(userInfo: IUserInfo): void;
  sendOffer(offer: RTCSessionDescriptionInit): Promise<void>;
  sendAnswer(answer: RTCSessionDescriptionInit): Promise<void>;
  sendIceCandidate(candidate: RTCIceCandidateInit, role: 'caller' | 'callee'): Promise<void>;
  onOffer(callback: (offer: RTCSessionDescriptionInit) => void): Unsubscriber;
  onAnswer(callback: (answer: RTCSessionDescriptionInit) => void): Unsubscriber;
  onIceCandidate(callback: (candidate: IceCandidateData) => void, role: 'caller' | 'callee'): Unsubscriber;
  onRemoteHangup(callback: () => void): Unsubscriber;
  getOffer(): Promise<RTCSessionDescriptionInit | null>;
  cleanup(): Promise<void>;
}

/**
 * Firebase Firestore-based signaling service for WebRTC.
 * Handles offer/answer exchange and ICE candidate transmission.
 */
export class FirebaseSignalingService implements ISignalingService {
  private logger = Logger.getInstance('FirebaseSignalingService');
  private db: FirebaseFirestoreTypes.Module;
  private userInfo: IUserInfo | null = null;
  private subscriptionManager = new SubscriptionManager();
  private remoteHangupListenerActive = false;

  constructor(db?: FirebaseFirestoreTypes.Module) {
    this.db = db || firestore();
  }

  /**
   * Initialize the signaling service with user information
   */
  initialize(userInfo: IUserInfo): void {
    this.userInfo = userInfo;
  }

  /**
   * Get the current user's document reference
   */
  private getUserDocRef(): FirebaseFirestoreTypes.DocumentReference | null {
    if (!this.userInfo?.id) return null;
    return this.db.collection(FireStoreCollection.users).doc(this.userInfo.id);
  }

  /**
   * Get the meet document reference
   */
  private getMeetDocRef(): FirebaseFirestoreTypes.DocumentReference {
    return this.db.collection(COLLECTION_PATHS.MEETS).doc(COLLECTION_PATHS.ROOM_ID);
  }

  /**
   * Send an offer to the signaling server
   */
  async sendOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    const cRef = this.getMeetDocRef();
    await cRef.set({
      offer: {
        type: offer.type,
        sdp: offer.sdp,
      },
    });
    this.logger.info('Offer sent to signaling server');
  }

  /**
   * Send an answer to the signaling server
   */
  async sendAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    const cRef = this.getMeetDocRef();
    await cRef.update({
      answer: {
        type: answer.type,
        sdp: answer.sdp,
      },
    });
    this.logger.info('Answer sent to signaling server');
  }

  /**
   * Send an ICE candidate to the signaling server
   */
  async sendIceCandidate(candidate: RTCIceCandidateInit, role: 'caller' | 'callee'): Promise<void> {
    const cRef = this.getMeetDocRef();
    const collectionName = role === 'caller' ? COLLECTION_PATHS.CALLER : COLLECTION_PATHS.CALLEE;
    await cRef.collection(collectionName).add(candidate);
    this.logger.debug(`ICE candidate sent as ${role}`);
  }

  /**
   * Get the current offer from the signaling server
   */
  async getOffer(): Promise<RTCSessionDescriptionInit | null> {
    const cRef = this.getMeetDocRef();
    const doc = await cRef.get();
    const data = doc.data();
    return data?.offer || null;
  }

  /**
   * Listen for incoming offers on the user's document
   */
  onOffer(callback: (offer: RTCSessionDescriptionInit) => void): Unsubscriber {
    const userRef = this.getUserDocRef();
    if (!userRef) {
      this.logger.warn('Cannot listen for offers: no user info');
      return () => {};
    }

    const unsubscribe = userRef.onSnapshot({
      next: (snapshot: FirebaseFirestoreTypes.DocumentSnapshot) => {
        const data = snapshot.data() as UserDocumentData | undefined;
        if (data?.offer?.type && data?.offer?.sdp) {
          callback({ type: data.offer.type, sdp: data.offer.sdp });
        }
      },
      error: (error) => {
        this.logger.error('Error listening for offers:', error);
      },
    });

    this.subscriptionManager.addSubscription('offerListener', unsubscribe);
    return () => this.subscriptionManager.removeSubscription('offerListener');
  }

  /**
   * Listen for incoming answers on the user's document
   */
  onAnswer(callback: (answer: RTCSessionDescriptionInit) => void): Unsubscriber {
    const userRef = this.getUserDocRef();
    if (!userRef) {
      this.logger.warn('Cannot listen for answers: no user info');
      return () => {};
    }

    const unsubscribe = userRef.onSnapshot({
      next: (snapshot: FirebaseFirestoreTypes.DocumentSnapshot) => {
        const data = snapshot.data() as UserDocumentData | undefined;
        if (data?.answer?.type && data?.answer?.sdp) {
          callback({ type: data.answer.type, sdp: data.answer.sdp });
        }
      },
      error: (error) => {
        this.logger.error('Error listening for answers:', error);
      },
    });

    this.subscriptionManager.addSubscription('answerListener', unsubscribe);
    return () => this.subscriptionManager.removeSubscription('answerListener');
  }

  /**
   * Listen for incoming ICE candidates
   */
  onIceCandidate(callback: (candidate: IceCandidateData) => void, role: 'caller' | 'callee'): Unsubscriber {
    const cRef = this.getMeetDocRef();
    // If I'm the caller, I listen for callee candidates, and vice versa
    const remoteName = role === 'caller' ? COLLECTION_PATHS.CALLEE : COLLECTION_PATHS.CALLER;

    const unsubscribe = cRef.collection(remoteName).onSnapshot(
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
            const candidateData = change.doc.data() as IceCandidateData;
            callback(candidateData);
          }
        });
      },
      (error) => {
        this.logger.error('Error listening for ICE candidates:', error);
      }
    );

    this.subscriptionManager.addSubscription(`iceCandidates-${remoteName}`, unsubscribe);
    return () => this.subscriptionManager.removeSubscription(`iceCandidates-${remoteName}`);
  }

  /**
   * Listen for remote hangup (document removal)
   */
  onRemoteHangup(callback: () => void): Unsubscriber {
    if (this.remoteHangupListenerActive) {
      return () => {};
    }
    this.remoteHangupListenerActive = true;

    const meetsCollection = this.db.collection(COLLECTION_PATHS.MEETS);
    const unsubscribe = meetsCollection.onSnapshot(
      (snapshot: FirebaseFirestoreTypes.QuerySnapshot) => {
        snapshot.docChanges().forEach((change: FirebaseFirestoreTypes.DocumentChange) => {
          if (change.type === "removed") {
            callback();
          }
        });
      },
      (error: Error) => {
        this.logger.error('Error listening for remote hangup:', error);
      }
    );

    this.subscriptionManager.addSubscription('remoteHangup', unsubscribe);
    return () => {
      this.subscriptionManager.removeSubscription('remoteHangup');
      this.remoteHangupListenerActive = false;
    };
  }

  /**
   * Clean up all Firestore data and subscriptions
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up signaling data');

    // Unsubscribe from all listeners
    this.subscriptionManager.cleanup();
    this.remoteHangupListenerActive = false;

    // Delete Firestore documents
    const cRef = this.getMeetDocRef();
    try {
      const calleeCandidate = await cRef.collection(COLLECTION_PATHS.CALLEE).get();
      const calleeDeletes = calleeCandidate.docs.map((candidate) => candidate.ref.delete());
      await Promise.all(calleeDeletes);

      const callerCandidate = await cRef.collection(COLLECTION_PATHS.CALLER).get();
      const callerDeletes = callerCandidate.docs.map((candidate) => candidate.ref.delete());
      await Promise.all(callerDeletes);

      await cRef.delete();
    } catch (error) {
      this.logger.warn('Error cleaning up Firestore data:', error);
    }
  }
}
