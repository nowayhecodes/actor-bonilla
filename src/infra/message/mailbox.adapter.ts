import { EventEmitter } from 'node:events';
import { Message } from './contracts/message';
import { Mailbox } from './contracts/mailbox';

export class MailboxAdapter extends EventEmitter implements Mailbox {
  private messages: Message[] = [];

  enqueueMessage(message: Message): void {
    this.messages.push(message);
    this.emit('message');
  }

  dequeueMessage(): Message | undefined {
    return this.messages.shift();
  }

  hasMessages(): boolean {
    return this.messages.length > 0;
  }
}
