import 'mocha';
import { expect } from 'chai';
import Counter from '../../src/lib/counter';
import Firebase from '../../src/lib/firebase';
import * as sinon from 'sinon';

describe('Counter', () => {
  const sandbox = sinon.createSandbox();

  const counterName = 'bacon';
  const counterRefName = `counter/${counterName}`;

  function getCounterRefMock() {
    const databases: Map<string, any> = new Map<string, any>();
    return {
      ref(x: string) {
        if (!databases.has(x)) {
          databases.set(x, null);
        }
        return {
          once(name: string) {
            return {
              val() {
                return databases.get(x);
              },
            };
          },
          set(data: any) {
            databases.set(x, data);
          },
          remove() {
            databases.delete(x);
          },
          transaction(func: (dat: any) => any) {
            databases.set(x, func(databases.get(x)));
          },
        };
      },
    };
  }

  beforeEach(async () => {
    sandbox.stub(Firebase, 'getDatabase').returns(getCounterRefMock());
  });

  afterEach(() => sandbox.restore());

  describe('increment', () => {
    it('should initialize a counter if one does not exist', async () => {
      const counter = new Counter(counterName);
      await counter.increment();
      const val = await Firebase.getDatabase()
        .ref(counterRefName)
        .once('value');
      expect(val.val().count).to.equal(1);
    });

    it('should increment an existing counter', async () => {
      const counter1 = new Counter(counterName);
      const counter2 = new Counter(counterName);

      await Promise.all([counter1.increment(), counter2.increment()]);

      const val = await Firebase.getDatabase()
        .ref(counterRefName)
        .once('value');
      expect(val.val().count).to.equal(2);
    });
  });

  describe('set', () => {
    it('should initialize a counter if one does not exist', async () => {
      const counter = new Counter(counterName);
      await counter.set(10);
      const val = await Firebase.getDatabase()
        .ref(counterRefName)
        .once('value');
      expect(val.val().count).to.equal(10);
    });

    it('should update an existing counter', async () => {
      const counter1 = new Counter(counterName);
      await counter1.increment();
      const counter2 = new Counter(counterName);
      await counter2.set(0);
      const val = await Firebase.getDatabase()
        .ref(counterRefName)
        .once('value');
      expect(val.val().count).to.equal(0);
    });
  });

  describe('getValue', () => {
    it('should return 0 if one does not exist', async () => {
      const counter = new Counter(counterName);
      const val = await counter.getValue();
      expect(val).to.equal(0);
    });

    it('should get the value of an existing counter', async () => {
      await Firebase.getDatabase()
        .ref(counterRefName)
        .set({ count: 271 });
      const counter = new Counter(counterName);
      const val = await counter.getValue();
      expect(val).to.equal(271);
    });

    it('should return different values after increment', async () => {
      await Firebase.getDatabase()
        .ref(counterRefName)
        .set({ count: 271 });
      const counter = new Counter(counterName);
      const beforeIncrementValue = await counter.getValue();
      expect(beforeIncrementValue).to.equal(271);
      await counter.increment();
      const afterIncrementValue = await counter.getValue();
      expect(afterIncrementValue).to.equal(272);
    });
  });

  describe('destroy', () => {
    it('should destroy the existing counter', async () => {
      const counter = new Counter(counterName);
      await counter.increment();
      const beforeDestory = await Firebase.getDatabase()
        .ref(counterRefName)
        .once('value');
      expect(beforeDestory.val().count).to.equal(1);
      await counter.destroy();
      const afterDestroy = await Firebase.getDatabase()
        .ref(counterRefName)
        .once('value');
      expect(afterDestroy.val()).to.equal(null);
    });
  });
});
