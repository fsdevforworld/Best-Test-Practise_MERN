import * as sinon from 'sinon';
import { clean } from '../../../test-helpers';
import {
  CoreAccountStatus,
  getCoreAccountStatus,
} from '../../../../src/domain/account-management/account-status';
import { User } from '../../../../src/models';
import { expect } from 'chai';

describe('Account Status', () => {
  const sandbox = sinon.createSandbox();
  before(() => clean());
  afterEach(() => clean(sandbox));

  describe('getCoreAccountStatus', () => {
    it('should return CoreAccountStatus.DELETED when the user is not found', async () => {
      sandbox.stub(User, 'findByPk').resolves(null);
      expect(await getCoreAccountStatus(1)).to.deep.eq({ status: CoreAccountStatus.DELETED });
    });

    it('should return CoreAccountStatus.FRAUD when the user object has the fraud property marked as true', async () => {
      sandbox.stub(User, 'findByPk').resolves({ fraud: true });
      expect(await getCoreAccountStatus(1)).to.deep.eq({ status: CoreAccountStatus.FRAUD });
    });

    it('should return CoreAccountStatus.ACTIVE when the user is found and does not have the fraud property', async () => {
      sandbox.stub(User, 'findByPk').resolves({ fraud: false });
      expect(await getCoreAccountStatus(1)).to.deep.eq({ status: CoreAccountStatus.ACTIVE });
    });
  });
});
