import 'mocha';
import { expect } from 'chai';
import { sequelize } from '../../src/models';
import {
  retryWhenDeadlocked,
  bulkInsertAndRetry,
  streamQuery,
  streamFindAll,
} from '../../src/lib/sequelize-helpers';
import * as sinon from 'sinon';
import factory from '../factories';
import { User } from '../../src/models';
import { clean } from '../test-helpers';

describe('sequelize', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  afterEach(async () => {
    sandbox.restore();
    await clean();
  });

  describe('retryWhenDeadlocked', () => {
    it('should retry up to maxRetry times', async () => {
      const func = sandbox.stub();
      func.throws({ original: { code: 'ER_LOCK_DEADLOCK' } });
      try {
        await retryWhenDeadlocked(sequelize, func, 0, 3);
      } catch (err) {
        expect(err.original.code).to.equal('ER_LOCK_DEADLOCK');
      } finally {
        expect(func.callCount).to.equal(4);
      }
    });

    it('should only run once if successful', async () => {
      const func = sandbox.stub();
      func.returns('bacon');
      const res = await retryWhenDeadlocked(sequelize, func, 0, 3);
      expect(res).to.equal('bacon');
    });
  });

  describe('bulkInsertAndRetry', () => {
    it('should return inserted rows', async () => {
      const users = await Promise.all([factory.build('user'), factory.build('user')]);
      const inserted = await bulkInsertAndRetry(
        User,
        users.map(u => u.toJSON()),
      );
      expect(inserted.length).to.equal(users.length);
      inserted.forEach((insertedUser, i) => {
        expect(insertedUser.firstName).to.equal(users[i].firstName);
        expect(insertedUser.lastName).to.equal(users[i].lastName);
      });
    });
  });

  describe('streamQuery', () => {
    it('will return all the data', async () => {
      await Promise.all([factory.create('user'), factory.create('user')]);
      const data: any[] = [];

      await streamQuery(
        'SELECT * FROM user',
        (row: any) => {
          data.push(row);
        },
        1,
      );

      expect(data.length).to.equal(2);
    });

    it('handles errors gracefully?', async () => {
      await Promise.all([factory.create('user'), factory.create('user')]);

      await expect(
        streamQuery(
          'SELECT * FROM user',
          async (row: any) => {
            throw new Error('bacon');
          },
          1,
        ),
      ).to.be.rejectedWith('bacon');
    });

    it('should respect the max connection limit', async () => {
      await Promise.all(
        Array(10)
          .fill(null)
          .map(() => factory.create('user')),
      );
      let concurrent = 0;
      let maxConcurrent = 0;
      await streamQuery(
        'SELECT * FROM user',
        async (row: any) => {
          concurrent += 1;
          maxConcurrent = Math.max(concurrent, maxConcurrent);
          await new Promise(resolve => setTimeout(resolve, 100));
          concurrent -= 1;
        },
        3,
      );

      expect(maxConcurrent).to.equal(3);
    });
  });

  describe('streamFindQuery', () => {
    it('will return all the data', async () => {
      await Promise.all(
        Array(10)
          .fill(null)
          .map(() => factory.create('user')),
      );

      const ids = new Set();
      const pageSize = 2;
      await streamFindAll(
        User,
        {},
        (row: User) => {
          ids.add(row.id);
        },
        pageSize,
      );
      expect(ids.size).to.equal(10);
    });

    it('handles errors gracefully', async () => {
      await Promise.all(
        Array(10)
          .fill(null)
          .map(() => factory.create('user')),
      );
      await expect(
        streamFindAll(User, {}, (row: User) => {
          throw new Error('bacon');
        }),
      ).to.be.rejectedWith('bacon');
    });
  });
});
