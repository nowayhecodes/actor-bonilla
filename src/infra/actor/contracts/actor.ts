import { EventEmitter } from 'node:events';
import { Message } from '../../message/contracts/message';

export interface Actor extends EventEmitter {
  process(message: Message): void;
}
