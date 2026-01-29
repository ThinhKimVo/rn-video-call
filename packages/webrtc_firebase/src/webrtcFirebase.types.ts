import {IUserInfo} from "@rn-video-call/firebase_user";
import {MediaStream} from "react-native-webrtc";
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