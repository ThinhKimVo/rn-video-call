export enum VideoCallErrorType {
  SETUP_FAILED = 'SETUP_FAILED',
  MEDIA_ACCESS_DENIED = 'MEDIA_ACCESS_DENIED',
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  FIREBASE_ERROR = 'FIREBASE_ERROR',
  PEER_CONNECTION_ERROR = 'PEER_CONNECTION_ERROR',
  CAMERA_ERROR = 'CAMERA_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export class VideoCallError extends Error {
  public readonly type: VideoCallErrorType;
  public readonly originalError?: Error;

  constructor(
    type: VideoCallErrorType,
    message: string,
    originalError?: Error
  ) {
    super(message);
    this.name = 'VideoCallError';
    this.type = type;
    this.originalError = originalError;
  }

  public static fromError(error: Error, type: VideoCallErrorType = VideoCallErrorType.UNKNOWN_ERROR): VideoCallError {
    return new VideoCallError(type, error.message, error);
  }

  public toJSON() {
    return {
      name: this.name,
      type: this.type,
      message: this.message,
      stack: this.stack,
      originalError: this.originalError?.message,
    };
  }
}

export interface ErrorHandler {
  onError: (error: VideoCallError) => void;
}

export const createErrorHandler = (onError?: (error: VideoCallError) => void): ErrorHandler => ({
  onError: onError || ((error) => console.error('VideoCall Error:', error.toJSON())),
});