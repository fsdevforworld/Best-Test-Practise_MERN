import * as sinon from 'sinon';
import { clean } from '../../../test-helpers';
import { expect } from 'chai';
import { BaseDaveApiError } from '@dave-inc/error-types/src/index';
import factory from '../../../factories';
import { User } from '../../../../src/models';
import { fail } from 'assert';
import {
  findRemovableUserById,
  AccountRemovalError,
} from '../../../../src/domain/account-management';
import { BankingDataSource } from '@dave-inc/wire-typings';

describe('Account Management [Integration Tests] AccountRemoval', async () => {
  const sandbox = sinon.createSandbox();

  afterEach(async () => clean(sandbox));

  describe('findRemovableUserById() should', async () => {
    it('respond with ConflictError if the user is not found', async () => {
      sandbox.stub(User, 'findByPk').resolves(null);
      try {
        await findRemovableUserById(1);
        fail('Expected Error was not thrown');
      } catch (e) {
        expect(e instanceof AccountRemovalError).to.eq(true);
        expect((e as BaseDaveApiError).message).to.contain(
          'No user account was found or it has already been deleted.',
        );
      }
    });

    it('respond with ConflictError if the user cannot be deleted', async () => {
      const user = await factory.create<User>('user', {
        id: 998245124,
      });
      await factory.create('bank-connection', {
        userId: user.id,
        bankingDataSource: BankingDataSource.BankOfDave,
      });
      sandbox.stub(User, 'findByPk').resolves(user);
      try {
        await findRemovableUserById(1);
        fail('Expected Error was not thrown');
      } catch (e) {
        expect(e instanceof AccountRemovalError).to.eq(true);
        expect((e as BaseDaveApiError).message).to.contain(
          '[user-account-removal] User cannot be deleted.',
        );
      }
    });

    it('respond with a user if the user is found and can be deleted', async () => {
      const user = await factory.create<User>('user', {
        id: 998245124,
      });
      sandbox.stub(User, 'findByPk').resolves(user);
      expect(await findRemovableUserById(1)).to.be.eq(user);
    });
  });
});
