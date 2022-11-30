import Firebase from './firebase';
import { memoize } from 'lodash';

/**
 * Remote counter object that syncs across multiple servers. Initializes with a name and stores in the
 * counter table in the default firebase db for this NODE_ENV.
 */
export default class Counter {
  public name: string;

  public getCounterRef = memoize(() => {
    return Firebase.getDatabase().ref(`counter/${this.name}`);
  });

  constructor(name: string) {
    this.name = name;
  }

  public async getValue(): Promise<number> {
    const snapshot = await this.getCounterRef().once('value');
    const value: number = snapshot.val() && snapshot.val().count;
    return value || 0;
  }

  public async increment(amount: number = 1): Promise<void> {
    await this.getCounterRef().transaction(counter => {
      if (counter && counter.count) {
        counter.count += amount;
      } else {
        counter = { count: amount };
      }

      return counter;
    });
  }

  public set(count: number): Promise<void> {
    return this.getCounterRef().set({
      count,
    });
  }

  public destroy(): Promise<void> {
    return this.getCounterRef().remove();
  }
}
