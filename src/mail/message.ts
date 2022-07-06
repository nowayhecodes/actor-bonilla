import type { JSONObject, Partition } from '../helper/types';

export class Message<T> {
  #partition: Partition;
  #content: T;

  constructor(public partition: Partition, public content: T) {
    this.#partition = partition;
    this.#content = content;
  }

  public static of<T>(partition: Partition, content: T): Message<T> {
    return new Message(partition, content);
  }

  public static ofJson<T>(
    partition: Partition,
    content: JSONObject<T>
  ): Message<JSONObject<T>> {
    return new Message(partition, content);
  }

  public get value(): Record<string, any> {
    return {
      partition: this.#partition,
      content: this.#content,
    };
  }
}
