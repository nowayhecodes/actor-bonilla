import type { Subscriber } from '../helper/types';
import { Message } from './message';

export class Subscription<T> {
  public readonly messages: Message<T>[] = [];
  public readonly _id: string;
  public readonly _subscriber: Subscriber<T>;

  constructor(public id: string, public subscriber: Subscriber<T>) {
    this._id = id;
    this._subscriber = subscriber;
  }

  async process(): Promise<void> {
    const message = this.messages[0];
    if (message) {
      if (await this._subscriber.onReceive(message)) {
        this.messages.splice(0, 1);
      }
    }
  }
}
