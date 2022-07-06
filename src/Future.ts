/**
 * @class Future
 */
export class Future<T> {
  #getHook: T;
  #getHookResult: T;

  constructor() {}

  get hookResult(): T {
    if (!this.#getHook) {
      if (!this.#getHookResult) {
        this.#getHookResult = this.#getHook;
      }
    }
    return this.#getHookResult;
  }

  set getHook(hook: T) {
    this.#getHook = hook;
  }
}
