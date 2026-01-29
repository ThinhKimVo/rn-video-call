import {
  mediaDevices,
  MediaStream,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
} from "react-native-webrtc";
import firestore, {
  FirebaseFirestoreTypes,
} from "@react-native-firebase/firestore";

import type {IVideoCall} from "@rn-video-call/base";
import {Base, COLLECTION_PATHS, Logger, VideoCallError, VideoCallErrorType, ErrorHandler, createErrorHandler, SubscriptionManager, VideoCallEventEmitter, IVideoCallEventEmitter} from "@rn-video-call/base";
import {
  SetUpUserCallbacksType,
  SetUpInCallPropertiesType,
  MediaConstraints,
  SessionConstraints,
  UserDocumentData,
  IceCandidateData,
  MediaDeviceInfoType,
  isSwitchableCameraTrack,
} from "./webrtcFirebase.types";
import {FireStoreCollection, IUserInfo} from "@rn-video-call/firebase_user";

export const peerConstraints = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302",
    },
  ],
};

export class WebRTCFirebase extends Base implements IVideoCall {
  private static instance: WebRTCFirebase;
  private logger = Logger.getInstance('WebRTCFirebase');
  private errorHandler: ErrorHandler = createErrorHandler();
  private subscriptionManager = new SubscriptionManager();
  private remoteHangupListenerActive = false;
  private _eventEmitter = new VideoCallEventEmitter();

  peerConnection: RTCPeerConnection | null = null;
  private connecting = false;
  private db: FirebaseFirestoreTypes.Module;
  private meetId?: string;
  private userInfo: IUserInfo | null = null;
  private localMediaStream: MediaStream | null = null;
  private remoteMediaStream: MediaStream | null = null;
  private isMuted = false;
  private isFrontCamera = true;
  private localCameraEnabled = true;
  private cameraCount = 0;
  private remoteCandidates: (RTCIceCandidate | null)[] = [];

  /**
   * Get the event emitter for subscribing to video call events.
   * This provides a cleaner alternative to callback-based state updates.
   */
  get events(): IVideoCallEventEmitter {
    return this._eventEmitter;
  }

  private setLocalStream: ((arg0?: MediaStream) => void) | undefined;
  private setRemoteStream: ((arg0?: MediaStream) => void) | undefined;
  private setGettingCall: ((isGettingCall: boolean) => void) | undefined;

  private setIsMuted: ((isMuted: boolean) => void) | undefined;
  private setIsFrontCamera: ((isFrontCamera: boolean) => void) | undefined;
  private setLocalCameraEnabled: ((enabled: boolean) => void) | undefined;
  private setRemoteCameraEnabled: ((enabled: boolean) => void) | undefined;

  constructor() {
    super();
    this.db = firestore();
  }

  static getInstance = () => {
    if (!WebRTCFirebase.instance) {
      WebRTCFirebase.instance = new WebRTCFirebase();
    }
    return WebRTCFirebase.instance;
  };

  getConnecting = async () => {
    return this.connecting;
  };

  getPeerConnection = () => {
    return this.peerConnection;
  };

  getMeetId = () => {
    return this.meetId;
  };

  setupInCallProperties = ({
    setIsMuted,
    setIsFrontCamera,
    setLocalCameraEnabled,
    setRemoteCameraEnabled,
  }: SetUpInCallPropertiesType) => {
    this.setIsMuted = setIsMuted;
    this.setIsFrontCamera = setIsFrontCamera;
    this.setLocalCameraEnabled = setLocalCameraEnabled;
    this.setRemoteCameraEnabled = setRemoteCameraEnabled;
  }

  setupCallbacks = ({
    userInfo,
    setLocalStream,
    setRemoteStream,
    setGettingCall,
    errorHandler,
  }: SetUpUserCallbacksType) => {
    this.setLocalStream = setLocalStream;
    this.setRemoteStream = setRemoteStream;
    this.setGettingCall = setGettingCall;
    this.userInfo = userInfo;
    if (errorHandler) {
      this.errorHandler = errorHandler;
    }

    if (userInfo?.id) {
      const cRef = this.db
        .collection(FireStoreCollection.users)
        .doc(userInfo.id);
      const unsubscribe = cRef.onSnapshot({
        next: async (snapshot: FirebaseFirestoreTypes.DocumentSnapshot) => {
          // On answer start the call
          const data = snapshot.data() as UserDocumentData | undefined;
          if (
            this.peerConnection &&
            !this.peerConnection.remoteDescription &&
            data?.answer?.type &&
            data?.answer?.sdp
          ) {
            await this.peerConnection.setRemoteDescription(
              new RTCSessionDescription({
                type: data.answer.type,
                sdp: data.answer.sdp,
              })
            );

            this.processCandidates();
          }

          if (data && data.offer && !this.connecting) {
            this.setGettingCall?.(true);
            this._eventEmitter.emit('gettingCall', true);
            this.listenRemoteHangup()
          }
        },
        error: (error) => {
          const videoCallError = VideoCallError.fromError(error, VideoCallErrorType.FIREBASE_ERROR);
          this.logger.error('Error in user snapshot listener:', error);
          this.errorHandler.onError(videoCallError);
        },
      });
      this.subscriptionManager.addSubscription('userSnapshot', unsubscribe);
    }
  };

  getAvailableMediaDevices = async () => {
    try {
      this.cameraCount = 0;
      const devices = await mediaDevices.enumerateDevices() as MediaDeviceInfoType[];

      devices.forEach((device) => {
        if (device.kind !== "videoinput") {
          return;
        }

        this.cameraCount = this.cameraCount + 1;
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const videoCallError = VideoCallError.fromError(error, VideoCallErrorType.SETUP_FAILED);
      this.logger.error('Error getting available media devices:', err);
      this.errorHandler.onError(videoCallError);
    }
  };

  getStream = async () => {
    const mediaConstraints: MediaConstraints = {
      audio: true,
      video: {
        frameRate: 30,
        facingMode: "user",
      },
    };

    const isVoiceOnly = false;
    try {
      const mediaStream = await mediaDevices.getUserMedia(mediaConstraints);

      if (isVoiceOnly && mediaStream) {
        const videoTrack = mediaStream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.enabled = false;
        }
      }

      return mediaStream;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const videoCallError = VideoCallError.fromError(error, VideoCallErrorType.MEDIA_ACCESS_DENIED);
      this.logger.error('Error getting media stream:', err);
      this.errorHandler.onError(videoCallError);
      return null;
    }
  };

  handleRemoteCandidate = async (iceCandidate: IceCandidateData) => {
    try {
      const candidate = new RTCIceCandidate(iceCandidate);

      if (!this.peerConnection || this.peerConnection.remoteDescription == null) {
        this.remoteCandidates.push(candidate);
        return;
      }

      await this.peerConnection.addIceCandidate(candidate);
      this.logger.debug('Successfully added ICE candidate');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const videoCallError = VideoCallError.fromError(err, VideoCallErrorType.CONNECTION_FAILED);
      this.logger.error('Error handling remote candidate:', error);
      this.errorHandler.onError(videoCallError);
    }
  };

  processCandidates = async () => {
    if (this.remoteCandidates.length < 1 || !this.peerConnection) {
      return;
    }

    try {
      await Promise.all(
        this.remoteCandidates.map(async (candidate) => {
          if (candidate && this.peerConnection) {
            await this.peerConnection.addIceCandidate(candidate);
          }
        })
      );
      this.remoteCandidates = [];
      this.logger.debug(`Processed ${this.remoteCandidates.length} ICE candidates`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const videoCallError = VideoCallError.fromError(err, VideoCallErrorType.CONNECTION_FAILED);
      this.logger.error('Error processing candidates:', error);
      this.errorHandler.onError(videoCallError);
    }
  };

  listenRemoteHangup = () => {
    // Guard against duplicate listeners
    if (this.remoteHangupListenerActive) {
      return;
    }
    this.remoteHangupListenerActive = true;

    const meetsCollection = this.db.collection(COLLECTION_PATHS.MEETS);
    const unsubscribe = meetsCollection.onSnapshot(
      (snapshot: FirebaseFirestoreTypes.QuerySnapshot) => {
        snapshot.docChanges().forEach((change: FirebaseFirestoreTypes.DocumentChange) => {
          if (change.type == "removed") {
            this.hangup();
          }
        });
      },
      (error: Error) => {
        const videoCallError = VideoCallError.fromError(error, VideoCallErrorType.FIREBASE_ERROR);
        this.logger.error('Error listening for remote hangup:', error);
        this.errorHandler.onError(videoCallError);
      }
    );
    this.subscriptionManager.addSubscription('remoteHangup', unsubscribe);
  }

  collectIceCandidates = async (
    cRef: FirebaseFirestoreTypes.DocumentReference<FirebaseFirestoreTypes.DocumentData>,
    localName: string,
    remoteName: string
  ) => {
    const candidateCollection = cRef.collection(localName);

    if (this.peerConnection) {
      // on new ICE candidate add it to firestore
      const iceCandidateHandler = (event: RTCPeerConnectionIceEvent) => {
        // When you find a null candidate then there are no more candidates.
        // Gathering of candidates has finished.
        if (!event.candidate) {
          this.logger.debug('ICE candidate gathering completed');
          return;
        }

        // Send the event.candidate onto the person you're calling.
        // Keeping to Trickle ICE Standards, you should send the candidates immediately.
        candidateCollection.add(event.candidate.toJSON()).catch((error) => {
          const videoCallError = VideoCallError.fromError(error, VideoCallErrorType.FIREBASE_ERROR);
          this.logger.error('Error adding ICE candidate to Firestore:', error);
          this.errorHandler.onError(videoCallError);
        });
      };
      this.subscriptionManager.addEventListenerTracked(
        this.peerConnection,
        'icecandidate',
        iceCandidateHandler as (...args: unknown[]) => void,
        'peerConnection'
      );

      const iceConnectionHandler = () => {
        this.logger.info(
          'ICE connection state changed:',
          this.peerConnection?.iceConnectionState
        );
      };
      this.subscriptionManager.addEventListenerTracked(
        this.peerConnection,
        'iceconnectionstatechange',
        iceConnectionHandler as (...args: unknown[]) => void,
        'peerConnection'
      );

      const connectionStateHandler = () => {
        this.logger.info(
          'Connection state changed:',
          this.peerConnection?.connectionState
        );
      };
      this.subscriptionManager.addEventListenerTracked(
        this.peerConnection,
        'connectionstatechange',
        connectionStateHandler as (...args: unknown[]) => void,
        'peerConnection'
      );

      const signalingStateHandler = () => {
        this.logger.info(
          'Signaling state changed:',
          this.peerConnection?.signalingState
        );
      };
      this.subscriptionManager.addEventListenerTracked(
        this.peerConnection,
        'signalingstatechange',
        signalingStateHandler as (...args: unknown[]) => void,
        'peerConnection'
      );
    }

    // Get the ICE candidate added to firestore and update the local
    const unsubscribe = cRef.collection(remoteName).onSnapshot(
      (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === "added") {
            const candidateData = change.doc.data() as IceCandidateData;
            await this.handleRemoteCandidate(candidateData);
          }
        });
      },
      (error) => {
        const videoCallError = VideoCallError.fromError(error, VideoCallErrorType.CONNECTION_FAILED);
        this.logger.error('Error in ICE candidates listener:', error);
        this.errorHandler.onError(videoCallError);
      }
    );
    this.subscriptionManager.addSubscription(`iceCandidates-${remoteName}`, unsubscribe);
  };

  /**
   * Add an event listener to the peer connection.
   * Note: Uses relaxed typing due to react-native-webrtc's non-standard event types.
   */
  addEventListener(
    type: string,
    callback: (event: unknown) => void
  ) {
    if (this.peerConnection) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.peerConnection.addEventListener(type as any, callback as any);
    }
  }

  setup = async () => {
    this.logger.info('Setting up WebRTC connection');
    try {
      this.peerConnection = new RTCPeerConnection(peerConstraints);

      // Get the audio and video stream for the call
      await this.getAvailableMediaDevices();

      const stream = await this.getStream();

      if (stream) {
        this.setLocalStream?.(stream);
        this._eventEmitter.emit('localStream', stream);
        this.localMediaStream = stream;

        this.localMediaStream.getTracks().forEach((track) => {
          if (this.peerConnection && this.localMediaStream) {
            this.peerConnection.addTrack(track, this.localMediaStream);
          }
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const trackHandler = (event: any) => {
          this.remoteMediaStream = this.remoteMediaStream || new MediaStream();

          // Type assertion needed due to react-native-webrtc type incompatibilities
          event.streams[0].getTracks().forEach((t: unknown) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.remoteMediaStream?.addTrack(t as any);
          });

          this.setRemoteStream?.(this.remoteMediaStream);
          this._eventEmitter.emit('remoteStream', this.remoteMediaStream);

          this.remoteMediaStream?.getVideoTracks().forEach((track) => {
            const muteHandler = () => {
              this.logger.info('Remote video track muted');
              this.setRemoteCameraEnabled?.(false);
              this._eventEmitter.emit('remoteCameraEnabled', false);
            };
            const unmuteHandler = () => {
              this.logger.info('Remote video track unmuted');
              this.setRemoteCameraEnabled?.(true);
              this._eventEmitter.emit('remoteCameraEnabled', true);
            };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.subscriptionManager.addEventListenerTracked(
              track as any,
              'mute',
              muteHandler as (...args: unknown[]) => void,
              'remoteTracks'
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.subscriptionManager.addEventListenerTracked(
              track as any,
              'unmute',
              unmuteHandler as (...args: unknown[]) => void,
              'remoteTracks'
            );
          });
        };
        this.subscriptionManager.addEventListenerTracked(
          this.peerConnection,
          'track',
          trackHandler as (...args: unknown[]) => void,
          'peerConnection'
        );

        this.setIsMuted?.(false);
        this._eventEmitter.emit('isMuted', false);
        this.isMuted = false;
        this.setIsFrontCamera?.(true);
        this._eventEmitter.emit('isFrontCamera', true);
        this.isFrontCamera = true;
        this.setLocalCameraEnabled?.(true);
        this._eventEmitter.emit('localCameraEnabled', true);
        this.localCameraEnabled = true;
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const videoCallError = VideoCallError.fromError(err, VideoCallErrorType.SETUP_FAILED);
      this.logger.error('Error during WebRTC setup:', error);
      this.errorHandler.onError(videoCallError);
    }
  };

  create = async () => {
    this.logger.info('Creating call');
    this.connecting = true;

    // setUp webrtc
    if (!this.peerConnection) {
      await this.setup();
    }

    // Document for the call
    const cRef = this.db.collection(COLLECTION_PATHS.MEETS).doc(COLLECTION_PATHS.ROOM_ID);

    this.listenRemoteHangup()

    // Exchange the ICE candidates between the caller and callee
    await this.collectIceCandidates(
      cRef,
      COLLECTION_PATHS.CALLER,
      COLLECTION_PATHS.CALLEE
    );

    if (this.peerConnection) {
      // Create the offer for the call
      // Store the offer under the document
      try {
        // react-native-webrtc uses legacy constraint format with 'mandatory' property
        // Type assertion needed as TypeScript types don't match the runtime API
        const sessionConstraints: SessionConstraints = {
          mandatory: {
            OfferToReceiveAudio: true,
            OfferToReceiveVideo: true,
            VoiceActivityDetection: true,
          },
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const offerDescription = await this.peerConnection.createOffer(
          sessionConstraints as any
        );

        await this.peerConnection.setLocalDescription(offerDescription);

        const cWithOffer = {
          offer: {
            type: offerDescription.type,
            sdp: offerDescription.sdp,
          },
        };

        await cRef.set(cWithOffer);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        const videoCallError = VideoCallError.fromError(err, VideoCallErrorType.PEER_CONNECTION_ERROR);
        this.logger.error('Error creating offer:', error);
        this.errorHandler.onError(videoCallError);
      }
    }
  };

  join = async () => {
    this.logger.info('Joining the call');
    this.connecting = true;
    this.setGettingCall?.(false);
    this._eventEmitter.emit('gettingCall', false);

    const cRef = this.db.collection(COLLECTION_PATHS.MEETS).doc(COLLECTION_PATHS.ROOM_ID);
    const offer = (await cRef.get()).data()?.offer;

    if (offer) {
      // Setup Webrtc
      await this.setup();

      // Exchange the ICE candidates
      // Check the parameters, Its reversed. Since the joining part is callee
      await this.collectIceCandidates(
        cRef,
        COLLECTION_PATHS.CALLEE,
        COLLECTION_PATHS.CALLER
      );

      if (this.peerConnection) {
        try {
          await this.peerConnection.setRemoteDescription(
            new RTCSessionDescription(offer)
          );

          // Create the answer for the call
          // Updates the document with answer
          const answer = await this.peerConnection.createAnswer();
          await this.peerConnection.setLocalDescription(answer);
          const cWithAnswer = {
            answer: {
              type: answer.type,
              sdp: answer.sdp,
            },
          };

          await this.processCandidates();
          await cRef.update(cWithAnswer);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          const videoCallError = VideoCallError.fromError(err, VideoCallErrorType.PEER_CONNECTION_ERROR);
          this.logger.error('Error during join process:', error);
          this.errorHandler.onError(videoCallError);
        }
      }
    }
  };

  hangup = async () => {
    this.logger.info('Hanging up call');
    this.setGettingCall?.(false);
    this._eventEmitter.emit('gettingCall', false);
    this._eventEmitter.emit('connectionState', 'disconnected');
    this.connecting = false;
    this.streamCleanUp();

    // Clean up event listeners before closing peer connection
    this.subscriptionManager.removeEventListenersForKey('peerConnection');
    this.subscriptionManager.removeEventListenersForKey('remoteTracks');

    // Clean up Firestore subscriptions related to the call
    this.subscriptionManager.removeSubscription('remoteHangup');
    this.subscriptionManager.removeSubscription('iceCandidates-caller');
    this.subscriptionManager.removeSubscription('iceCandidates-callee');
    this.remoteHangupListenerActive = false;

    await this.firebaseCleanUp();
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
  };

  /**
   * Cleanup all subscriptions and reset state.
   * Called when VideoCallProvider unmounts or userInfo changes.
   */
  cleanup = () => {
    this.logger.info('Cleaning up WebRTCFirebase instance');
    this.subscriptionManager.cleanup();
    this._eventEmitter.removeAllListeners();
    this.remoteHangupListenerActive = false;
    this.remoteCandidates = [];

    // Clear callback references
    this.setLocalStream = undefined;
    this.setRemoteStream = undefined;
    this.setGettingCall = undefined;
    this.setIsMuted = undefined;
    this.setIsFrontCamera = undefined;
    this.setLocalCameraEnabled = undefined;
    this.setRemoteCameraEnabled = undefined;
  };

  streamCleanUp = () => {
    this.logger.info('Cleaning up media streams');

    if (this.localMediaStream) {
      this.localMediaStream.getTracks().forEach((t) => t.stop());
      this.localMediaStream.release();
    }

    if (this.remoteMediaStream) {
      this.remoteMediaStream.getTracks().forEach((t) => t.stop());
      this.remoteMediaStream.release();
    }
    this.localMediaStream = null;
    this.remoteMediaStream = null;

    this.setLocalStream?.(undefined);
    this._eventEmitter.emit('localStream', undefined);
    this.setRemoteStream?.(undefined);
    this._eventEmitter.emit('remoteStream', undefined);
  };

  firebaseCleanUp = async () => {
    this.logger.info('Cleaning up Firebase data');
    const cRef = this.db.collection(COLLECTION_PATHS.MEETS).doc(COLLECTION_PATHS.ROOM_ID);
    if (cRef) {
      const calleeCandidate = await cRef.collection(COLLECTION_PATHS.CALLEE).get();
      const calleeDeletes = calleeCandidate.docs.map((candidate) =>
        candidate.ref.delete()
      );
      await Promise.all(calleeDeletes);

      const callerCandidate = await cRef.collection(COLLECTION_PATHS.CALLER).get();
      const callerDeletes = callerCandidate.docs.map((candidate) =>
        candidate.ref.delete()
      );
      await Promise.all(callerDeletes);

      await cRef.delete();
    }
  };

  toggleActiveMicrophone = async () => {
    this.logger.info('Toggling microphone');
    if (!this.localMediaStream) {
      return;
    }

    try {
      const audioTrack = this.localMediaStream?.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        const newMutedState = !this.isMuted;
        this.setIsMuted?.(newMutedState);
        this._eventEmitter.emit('isMuted', newMutedState);
        this.isMuted = newMutedState;
      } else {
        this.logger.warn('No audio track found to toggle microphone');
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const videoCallError = VideoCallError.fromError(err, VideoCallErrorType.MEDIA_ACCESS_DENIED);
      this.logger.error('Error toggling microphone:', error);
      this.errorHandler.onError(videoCallError);
    }
  };

  switchingCamera = async () => {
    this.logger.info('Switching camera');
    if (!this.localMediaStream) {
      return;
    }

    try {
      // Taken from above, we don't want to flip if we don't have another camera.
      if (this.cameraCount < 2) {
        this.logger.warn('Cannot switch camera: only one camera available');
        return;
      }

      const videoTrack = this.localMediaStream?.getVideoTracks()[0];
      if (videoTrack && isSwitchableCameraTrack(videoTrack)) {
        videoTrack._switchCamera();
        const newFrontCameraState = !this.isFrontCamera;
        this.setIsFrontCamera?.(newFrontCameraState);
        this._eventEmitter.emit('isFrontCamera', newFrontCameraState);
        this.isFrontCamera = newFrontCameraState;
      } else {
        this.logger.warn('Camera switching not available or no video track found');
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const videoCallError = VideoCallError.fromError(err, VideoCallErrorType.CAMERA_ERROR);
      this.logger.error('Error switching camera:', error);
      this.errorHandler.onError(videoCallError);
    }
  };

  toggleCameraEnabled = async () => {
    this.logger.info('Toggling camera enabled state');
    if (!this.localMediaStream) {
      return;
    }

    try {
      const videoTrack = this.localMediaStream?.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        const newCameraEnabledState = !this.localCameraEnabled;
        this.setLocalCameraEnabled?.(newCameraEnabledState);
        this._eventEmitter.emit('localCameraEnabled', newCameraEnabledState);
        this.localCameraEnabled = newCameraEnabledState;
      } else {
        this.logger.warn('No video track found to toggle camera');
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const videoCallError = VideoCallError.fromError(err, VideoCallErrorType.CAMERA_ERROR);
      this.logger.error('Error toggling camera enabled state:', error);
      this.errorHandler.onError(videoCallError);
    }
  };
}
