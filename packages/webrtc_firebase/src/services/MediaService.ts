import { mediaDevices, MediaStream } from "react-native-webrtc";
import { Logger, VideoCallError, VideoCallErrorType, ErrorHandler, createErrorHandler } from "@rn-video-call/base";
import { MediaConstraints, MediaDeviceInfoType, isSwitchableCameraTrack } from "../webrtcFirebase.types";

/**
 * Interface for media service operations
 */
export interface IMediaService {
  getLocalStream(): Promise<MediaStream | null>;
  getAvailableDevices(): Promise<MediaDeviceInfoType[]>;
  getCameraCount(): number;
  stopStream(stream: MediaStream): void;
  switchCamera(stream: MediaStream): boolean;
  toggleMicrophone(stream: MediaStream): boolean;
  toggleCamera(stream: MediaStream): boolean;
  isMuted(stream: MediaStream): boolean;
  isCameraEnabled(stream: MediaStream): boolean;
}

/**
 * Media service for handling audio/video streams.
 * Manages local media capture, device enumeration, and media controls.
 */
export class MediaService implements IMediaService {
  private logger = Logger.getInstance('MediaService');
  private errorHandler: ErrorHandler = createErrorHandler();
  private cameraCount = 0;

  /**
   * Get the number of available cameras
   */
  getCameraCount(): number {
    return this.cameraCount;
  }

  /**
   * Get available media devices
   */
  async getAvailableDevices(): Promise<MediaDeviceInfoType[]> {
    try {
      const devices = await mediaDevices.enumerateDevices() as MediaDeviceInfoType[];

      // Count video input devices (cameras)
      this.cameraCount = devices.filter(device => device.kind === 'videoinput').length;

      return devices;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const videoCallError = VideoCallError.fromError(error, VideoCallErrorType.SETUP_FAILED);
      this.logger.error('Error getting available media devices:', err);
      this.errorHandler.onError(videoCallError);
      return [];
    }
  }

  /**
   * Get local media stream with audio and video
   */
  async getLocalStream(): Promise<MediaStream | null> {
    const mediaConstraints: MediaConstraints = {
      audio: true,
      video: {
        frameRate: 30,
        facingMode: "user",
      },
    };

    try {
      // Enumerate devices first to get camera count
      await this.getAvailableDevices();

      const mediaStream = await mediaDevices.getUserMedia(mediaConstraints);
      this.logger.info('Local media stream obtained');
      return mediaStream;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const videoCallError = VideoCallError.fromError(error, VideoCallErrorType.MEDIA_ACCESS_DENIED);
      this.logger.error('Error getting media stream:', err);
      this.errorHandler.onError(videoCallError);
      return null;
    }
  }

  /**
   * Stop and release a media stream
   */
  stopStream(stream: MediaStream): void {
    if (!stream) return;

    try {
      stream.getTracks().forEach((track) => track.stop());
      stream.release();
      this.logger.info('Media stream stopped and released');
    } catch (error) {
      this.logger.warn('Error stopping media stream:', error);
    }
  }

  /**
   * Switch between front and back camera
   * @returns true if switch was successful
   */
  switchCamera(stream: MediaStream): boolean {
    if (!stream) {
      this.logger.warn('Cannot switch camera: no stream');
      return false;
    }

    if (this.cameraCount < 2) {
      this.logger.warn('Cannot switch camera: only one camera available');
      return false;
    }

    try {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && isSwitchableCameraTrack(videoTrack)) {
        videoTrack._switchCamera();
        this.logger.info('Camera switched');
        return true;
      }
      this.logger.warn('Camera switching not available');
      return false;
    } catch (error) {
      this.logger.error('Error switching camera:', error);
      return false;
    }
  }

  /**
   * Toggle microphone enabled state
   * @returns new muted state (true = muted)
   */
  toggleMicrophone(stream: MediaStream): boolean {
    if (!stream) {
      this.logger.warn('Cannot toggle microphone: no stream');
      return false;
    }

    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      this.logger.info(`Microphone ${audioTrack.enabled ? 'unmuted' : 'muted'}`);
      return !audioTrack.enabled; // Return muted state
    }

    this.logger.warn('No audio track found');
    return false;
  }

  /**
   * Toggle camera enabled state
   * @returns new enabled state
   */
  toggleCamera(stream: MediaStream): boolean {
    if (!stream) {
      this.logger.warn('Cannot toggle camera: no stream');
      return true; // Default to enabled
    }

    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      this.logger.info(`Camera ${videoTrack.enabled ? 'enabled' : 'disabled'}`);
      return videoTrack.enabled;
    }

    this.logger.warn('No video track found');
    return true;
  }

  /**
   * Check if the microphone is muted
   */
  isMuted(stream: MediaStream): boolean {
    if (!stream) return false;
    const audioTrack = stream.getAudioTracks()[0];
    return audioTrack ? !audioTrack.enabled : false;
  }

  /**
   * Check if the camera is enabled
   */
  isCameraEnabled(stream: MediaStream): boolean {
    if (!stream) return true;
    const videoTrack = stream.getVideoTracks()[0];
    return videoTrack ? videoTrack.enabled : true;
  }
}
