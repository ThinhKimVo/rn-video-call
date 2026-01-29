export interface IVideoCall {
  setup(): Promise<void>;
  create(): Promise<void>;
  join(): Promise<void>;
  hangup(): Promise<void>;
  getConnecting(): Promise<boolean>;
  getMeetId(): string | undefined;
  toggleActiveMicrophone(): Promise<void>;
  switchingCamera(): Promise<void>;
  toggleCameraEnabled(): Promise<void>;
}
