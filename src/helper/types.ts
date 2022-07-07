import { EventEmitter } from 'stream';
import { Message } from '../mail/message';

export type Partition = string;

export type JSONObject<T> = {
  [key: string]: T;
};

export type Subscriber<T> = {
  partitions: Partition[];
  onReceive(message: Message<T>): Promise<boolean>;
};

export type Provider<T> = Pick<EventTarget, 'dispatchEvent'> & {
  onMessage: (listener: EventEmitter) => void;
  postMessage: (message: Message<T>) => Promise<void> | void;
};
