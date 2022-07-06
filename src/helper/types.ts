import { Message } from '../mail/message';

export type Partition = string;

export type JSONObject<T> = {
  [key: string]: T;
};

export type Subscriber<T> = {
  partitions: Partition[];
  onReceive(message: Message<T>): Promise<boolean>;
};
