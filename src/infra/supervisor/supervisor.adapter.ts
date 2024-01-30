import { Actor } from '../actor/contracts/actor';
import { MessageType } from '../message/contracts/message';
import { Supervisor } from './contracts/supervisor';

export class SupervisorAdapter implements Supervisor {
  constructor(private actor: Actor) {}

  startActor(): void {
    this.actor.process({ type: MessageType.START });
  }

  restartActor(actor: Actor): void {
    actor.emit('message', { type: MessageType.RESTART });
  }

  abortActor(actor: Actor): void {
    actor.emit('message', { type: MessageType.ABORT });
  }
}
