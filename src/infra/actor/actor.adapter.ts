import { EventEmitter } from 'node:events';
import { Actor } from './contracts/actor';
import { Supervisor } from '../supervisor/contracts/supervisor';
import { MessageType } from '../message/contracts/message';
import { Mailbox } from '../message/contracts/mailbox';

export class ActorAdapter extends EventEmitter implements Actor {
  constructor(
    private id: number,
    private supervisor: Supervisor
  ) {
    super();
  }

  process(message: Mailbox.Input): void {
    setInterval(() => {
      if (this.listenerCount('message') > 0) {
        this.emit('message.processing', message);

        // Process message logic

        this.emit('message.processed', message);
      }
    }, 1000);
  }
}
