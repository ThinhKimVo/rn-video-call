import {useContext} from 'react';
import {VideoCallContext} from './VideoCallProvider';
import type {VideoCallState} from './reducer';

/**
 * Hook to access the video call context.
 * Throws an error if used outside of VideoCallProvider.
 */
const useVideoCallContext = () => {
    const context = useContext(VideoCallContext);
    if (!context) {
        throw new Error('useVideoCallContext must be used within a VideoCallProvider');
    }
    return context;
};

/**
 * Custom hook to select a specific part of the video call state.
 * @param selector A function that takes the video call state and returns a specific part of it.
 * @returns The part of the video call state selected by the selector function.
 */
const useVideoCallSelector = <T>(selector: (callState: VideoCallState) => T): T => {
    const {videoCallState} = useVideoCallContext();
    return selector(videoCallState);
};

export {useVideoCallContext, useVideoCallSelector};
