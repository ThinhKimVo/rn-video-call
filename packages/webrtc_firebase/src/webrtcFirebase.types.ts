import {IUserInfo} from "@rn-video-call/firebase_user";
import {MediaStream, MediaStreamTrack} from "react-native-webrtc";
import {ErrorHandler} from "@rn-video-call/base";

export type SetUpUserCallbacksType = {
  userInfo: IUserInfo;
  setLocalStream: (stream?: MediaStream) => void;
  setRemoteStream: (stream?: MediaStream) => void;
  setGettingCall: (isGettingCall: boolean) => void;
  errorHandler?: ErrorHandler;
};

export type SetUpInCallPropertiesType = {
  setIsMuted?: (isMuted: boolean) => void;
  setIsFrontCamera?: (isFrontCamera: boolean) => void;
  setLocalCameraEnabled?: (enabled: boolean) => void;
  setRemoteCameraEnabled?: (enabled: boolean) => void;
};

export interface MediaConstraints {
  audio: boolean;
  video: {
    frameRate: number;
    facingMode: string;
  };
}

export interface SessionConstraints {
  mandatory: {
    OfferToReceiveAudio: boolean;
    OfferToReceiveVideo: boolean;
    VoiceActivityDetection: boolean;
  };
}

/**
 * Firestore document data for user signaling (offer/answer exchange)
 */
export interface UserDocumentData {
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
}

/**
 * Firestore document data for ICE candidates
 */
export interface IceCandidateData {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

/**
 * Media device information returned from enumerateDevices
 */
export interface MediaDeviceInfoType {
  deviceId: string;
  groupId: string;
  kind: 'audioinput' | 'audiooutput' | 'videoinput';
  label: string;
}

/**
 * Extended MediaStreamTrack type for react-native-webrtc
 * which includes the private _switchCamera method
 */
export interface SwitchableCameraTrack extends MediaStreamTrack {
  _switchCamera: () => void;
}

/**
 * Type guard to check if a track has the _switchCamera method
 */
export function isSwitchableCameraTrack(track: MediaStreamTrack): track is SwitchableCameraTrack {
  return '_switchCamera' in track && typeof (track as SwitchableCameraTrack)._switchCamera === 'function';
}
