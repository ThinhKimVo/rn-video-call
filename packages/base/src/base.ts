import {IVideoCall} from "./methods";

/**
 * Abstract base class for video call implementations.
 * All video call providers must extend this class and implement its abstract methods.
 */
export abstract class Base implements IVideoCall {
  abstract setup(): Promise<void>;
  abstract create(): Promise<void>;
  abstract join(): Promise<void>;
  abstract hangup(): Promise<void>;
  abstract getConnecting(): Promise<boolean>;
  abstract getMeetId(): string | undefined;
  abstract toggleActiveMicrophone(): Promise<void>;
  abstract switchingCamera(): Promise<void>;
  abstract toggleCameraEnabled(): Promise<void>;
}
