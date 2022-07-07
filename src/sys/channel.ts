import { firstValueFrom, Observable } from 'rxjs';
import type { Provider } from '../helper/types';

export abstract class BaseChannel<T, U extends Provider<T>> {
  public abstract register(providers: U[]): Observable<T>;
  public registerPromise(providers: U[]): Promise<T> {
    return firstValueFrom(this.register(providers));
  }
}
