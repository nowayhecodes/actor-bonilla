export enum MessageType {
  PROCESS,
  PROCESSED,
  START,
  RESTART,
  RETRY,
  ABORT,
  REMOVE,
}

export interface Message {
  type: MessageType;
  data?: any;
}
