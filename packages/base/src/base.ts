import {IVideoCall} from "./methods";

export class Base implements IVideoCall {
  constructor(parameters: any) {}
  async setup(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  async create(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  async join(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  async hangup(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  async getConnecting(): Promise<boolean> {
    throw new Error("Method not implemented.");
  }
  getMeetId(): string | undefined {
    throw new Error("Method not implemented.");
  }
  async toggleActiveMicrophone(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  async switchingCamera(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  async toggleCameraEnabled(): Promise<void> {
    throw new Error("Method not implemented.");
  }
}
