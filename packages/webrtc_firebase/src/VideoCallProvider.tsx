import React, {
  createContext,
  PropsWithChildren,
  useEffect,
  useReducer,
} from "react";
import type { IVideoCallContext } from "./interfaces";
import {
  setGettingCall,
  setLocalStream,
  setRemoteStream,
  videoCallReducer,
} from "./reducer";
import { WebRTCFirebase } from "./webrtc_firebase_proxy";
import { MediaStream } from "react-native-webrtc";
import { useUserContext } from "@rn-video-call/firebase_user";

const WebRTCFirebaseService = WebRTCFirebase.getInstance()

interface VideoCallProviderProps extends PropsWithChildren {}

export const VideoCallContext = createContext<IVideoCallContext | null>(null);

export const VideoCallProvider: React.FC<VideoCallProviderProps> = ({
  children,
}) => {
  const { userState } = useUserContext();
  const [state, dispatch] = useReducer(videoCallReducer, {});

  const userInfo = userState?.userInfo || null

  useEffect(() => {
    if (!userInfo?.id) {
      return;
    }

    WebRTCFirebaseService.setupCallbacks({
      userInfo,
      setLocalStream: (stream: MediaStream | undefined) => dispatch(setLocalStream(stream)),
      setRemoteStream: (stream: MediaStream | undefined) => dispatch(setRemoteStream(stream)),
      setGettingCall: (isCalling: boolean) => dispatch(setGettingCall(isCalling)),
    });

    return () => {
      WebRTCFirebaseService.cleanup();
    };
  }, [userInfo]);

  return (
    <VideoCallContext.Provider
      value={{
        userInfo,
        videoCallState: state,
        videoCallDispatch: dispatch,
      }}
    >
      {children}
    </VideoCallContext.Provider>
  );
};
