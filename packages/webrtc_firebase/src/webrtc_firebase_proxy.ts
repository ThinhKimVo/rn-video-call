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
import {Base, COLLECTION_PATHS, Logger, VideoCallError, VideoCallErrorType, ErrorHandler, createErrorHandler} from "@rn-video-call/base";
import {SetUpUserCallbacksType, SetUpInCallPropertiesType, MediaConstraints, SessionConstraints} from "./webrtcFirebase.types";
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

  private setLocalStream: ((arg0?: MediaStream) => void) | undefined;
  private setRemoteStream: ((arg0?: MediaStream) => void) | undefined;
  private setGettingCall: ((isGettingCall: boolean) => void) | undefined;

  private setIsMuted: ((isMuted: boolean) => void) | undefined;
  private setIsFrontCamera: ((isFrontCamera: boolean) => void) | undefined;
  private setLocalCameraEnabled: ((enabled: boolean) => void) | undefined;
  private setRemoteCameraEnabled: ((enabled: boolean) => void) | undefined;

  constructor() {
    super({});
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
      cRef.onSnapshot({
        next: async (snapshot: any) => {
          // On answer start the call
          const data = snapshot.data();
          if (
            this.peerConnection &&
            !this.peerConnection.remoteDescription &&
            data &&
            data.answer
          ) {
            await this.peerConnection.setRemoteDescription(
              new RTCSessionDescription(data.answer)
            );

            this.processCandidates();
          }

          if (data && data.offer && !this.connecting) {
            this.setGettingCall?.(true);
            this.listenRemoteHangup()
          }
        },
        error: (error) => {
          const videoCallError = VideoCallError.fromError(error, VideoCallErrorType.FIREBASE_ERROR);
          this.logger.error('Error in user snapshot listener:', error);
          this.errorHandler.onError(videoCallError);
        },
      })
    }
  };

  getAvailableMediaDevices = async () => {
    try {
      this.cameraCount = 0;
      const devices: any = await mediaDevices.enumerateDevices();

      devices.map((device: {kind: string}) => {
        if (device.kind != "videoinput") {
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

  handleRemoteCandidate = async (iceCandidate: any) => {
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
    const meetsCollection = this.db.collection(COLLECTION_PATHS.MEETS);
    const subscriber = meetsCollection.onSnapshot(
      (snapshot: FirebaseFirestoreTypes.QuerySnapshot) => {
        snapshot.docChanges().forEach((change: FirebaseFirestoreTypes.DocumentChange) => {
          if (change.type == "removed") {
            this.hangup();
            subscriber();
          }
        });
      },
      (error: Error) => {
        const videoCallError = VideoCallError.fromError(error, VideoCallErrorType.FIREBASE_ERROR);
        this.logger.error('Error listening for remote hangup:', error);
        this.errorHandler.onError(videoCallError);
      }
    );
  }

  collectIceCandidates = async (
    cRef: FirebaseFirestoreTypes.DocumentReference<FirebaseFirestoreTypes.DocumentData>,
    localName: string,
    remoteName: string
  ) => {
    const candidateCollection = cRef.collection(localName);

    if (this.peerConnection) {
      // on new ICE candidate add it to firestore
      this.peerConnection.addEventListener("icecandidate", (event) => {
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
      });

      this.peerConnection.addEventListener(
        "iceconnectionstatechange",
        (event) => {
          this.logger.info(
            'ICE connection state changed:',
            this.peerConnection?.iceConnectionState
          );
        }
      );

      this.peerConnection.addEventListener("connectionstatechange", (event) => {
        this.logger.info(
          'Connection state changed:',
          this.peerConnection?.connectionState
        );
      });

      this.peerConnection.addEventListener("signalingstatechange", (event) => {
        this.logger.info(
          'Signaling state changed:',
          this.peerConnection?.signalingState
        );
      });
    }

    // Get the ICE candidate added to firestore and update the local
    cRef.collection(remoteName).onSnapshot(
      (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === "added") {
            await this.handleRemoteCandidate(change.doc.data());
          }
        });
      },
      (error) => {
        const videoCallError = VideoCallError.fromError(error, VideoCallErrorType.CONNECTION_FAILED);
        this.logger.error('Error in ICE candidates listener:', error);
        this.errorHandler.onError(videoCallError);
      }
    );
  };

  addEventListener<K extends keyof RTCPeerConnectionEventMap>(
    type: K,
    callback: (event: any) => void
  ) {
    if (this.peerConnection) {
      this.peerConnection.addEventListener(type, callback);
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
        this.localMediaStream = stream;

        this.localMediaStream.getTracks().forEach((track) => {
          if (this.peerConnection && this.localMediaStream) {
            this.peerConnection.addTrack(track, this.localMediaStream);
          }
        });

        this.peerConnection.addEventListener("track", (event) => {
          this.remoteMediaStream = this.remoteMediaStream || new MediaStream();

          event.streams[0].getTracks().forEach((t) => {
            this.remoteMediaStream?.addTrack(t);
          });

          this.setRemoteStream?.(this.remoteMediaStream);


          this.remoteMediaStream?.getVideoTracks().forEach((track) => {
            track.addEventListener("mute", (e) => {
              this.logger.info('Remote video track muted');
              this.setRemoteCameraEnabled?.(false);
            });

            track.addEventListener("unmute", (e) => {
              this.logger.info('Remote video track unmuted');
              this.setRemoteCameraEnabled?.(true);
            });
          });
        });

        this.setIsMuted?.(false);
        this.isMuted = false;
        this.setIsFrontCamera?.(true);
        this.isFrontCamera = true;
        this.setLocalCameraEnabled?.(true);
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
        const sessionConstraints = {
          mandatory: {
            OfferToReceiveAudio: true,
            OfferToReceiveVideo: true,
            VoiceActivityDetection: true,
          },
        } as any;
        const offerDescription = await this.peerConnection.createOffer(
          sessionConstraints
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
    this.connecting = false;
    this.streamCleanUp();
    await this.firebaseCleanUp();
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
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
    this.setRemoteStream?.(undefined);
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
        this.setIsMuted?.(!this.isMuted);
        this.isMuted = !this.isMuted;
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
      if (videoTrack && '_switchCamera' in videoTrack) {
        (videoTrack as any)._switchCamera();
        this.setIsFrontCamera?.(!this.isFrontCamera);
        this.isFrontCamera = !this.isFrontCamera;
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
        this.setLocalCameraEnabled?.(!this.localCameraEnabled);
        this.localCameraEnabled = !this.localCameraEnabled;
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
