import type { FiberConfig, Processor } from '../helper/types';

export class Fiber {
  #config: FiberConfig;
  #timerId: any;
  #processors: Processor[] = [];

  public readonly name: string;

  constructor(private config: FiberConfig) {
    const { resources, tickInterval } = config;
    this.#config = config;
    this.name = `fiber-with${resources.reduce(
      (aggregation, current) => `${aggregation}-${current}`,
      ''
    )}`;

    this.#timerId = setInterval(this.#tick.bind(this), tickInterval);
  }

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
