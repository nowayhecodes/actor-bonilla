import { Message } from './message';

export interface Mailbox {
  enqueueMessage(message: Mailbox.Input): void;
  dequeueMessage(): Mailbox.Output | undefined;
  hasMessages(): boolean;
}

export namespace Mailbox {
  export function is(value: any): value is Mailbox {
    return (
      value &&
      typeof value.enqueueMessage === 'function' &&
      typeof value.dequeueMessage === 'function' &&
      typeof value.hasMessages === 'function'
    );
  }
  export type Input = Message;

  export type Output = Partial<Message>;
}
