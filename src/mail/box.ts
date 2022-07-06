import uuid from '../helper/uuid';
import { Message } from './message';
import { Subscription } from './subscription';
import type { Subscriber } from '../helper/types';

export class Box<T> {
  #subscribedPartitions: { [sub: string]: string[] } = {};
  #subs: { [partition: string]: Subscription<T>[] } = {};

  public static empty<T>(): Box<T> {
    return new Box();
  }

  addSub(sub: Subscriber<T>): string {
    const id = uuid();
    const { partitions } = sub;

    this.#subscribedPartitions[id] = partitions;
    partitions.forEach((partition) => {
      this.#subs[partition] = this.#subs[partition] || [];
      this.#subs[partition].push(new Subscription(id, sub));
    });

    return id;
  }

  removeSub(sub: string): void {
    const partitions = this.#subscribedPartitions[sub];
    partitions.forEach(
      (partition) =>
        (this.#subs[partition] = this.#subs[partition].filter(
          (s) => s._id !== sub
        ))
    );
  }

  push(message: Message<T>): void {
    this.#subs[message.partition].forEach((sub) => sub.messages.push(message));
  }

  async poll(sub: string): Promise<void> {
    const partitions = this.#subscribedPartitions[sub];
    if (!partitions) {
      return;
    }

    partitions.forEach((partition) =>
      this.#subs[partition]
        .filter((managedSub) => managedSub.id === sub)
        .forEach(async (managedSub) => await managedSub.process())
    );
  }
}
