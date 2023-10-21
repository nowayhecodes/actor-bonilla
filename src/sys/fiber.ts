import type { FiberConfig, Processor } from '../helper/types';

export class Fiber {
  #config: FiberConfig;
  #timerId: any;
  #processors: Processor[] = [];

  public readonly name: string;

  /**
   * Constructor for the class.
   *
   * @param {FiberConfig} config - the configuration object for the class
   */
  constructor(private config: FiberConfig) {
    const { resources, tickInterval } = config;
    this.#config = config;
    this.name = `fiber-with${resources.reduce(
      (aggregation, current) => `${aggregation}-${current}`,
      ''
    )}`;

    this.#timerId = setInterval(this.#tick.bind(this), tickInterval);
  }

  /**
   * Acquires a processor if all requirements are met.
   *
   * @param {Processor} processor - The processor to acquire.
   * @return {boolean} Returns true if the processor was acquired, otherwise false.
   */
  public acquire(processor: Processor): boolean {
    if (
      processor.requirements.every(
        (req) => this.#config.resources.indexOf(req) !== -1
      )
    ) {
      this.#processors.push(processor);
      return true;
    }
    return false;
  }

  free = (): void => clearInterval(this.#timerId);
  #tick = (): void => this.#processors.forEach((p) => p.process());
}
