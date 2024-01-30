import { Actor } from '../../actor/contracts/actor';

export interface Supervisor {
  startActor(): void;
  restartActor(actor: Actor): void;
  abortActor(actor: Actor): void;
}
