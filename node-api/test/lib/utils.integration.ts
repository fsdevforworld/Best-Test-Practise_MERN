import { expect } from 'chai';
import * as sinon from 'sinon';
import factory from '../factories';

import { getModifications } from '../../src/lib/utils';
import { clean } from '../test-helpers';

describe('Utils', () => {
  const sandbox = sinon.createSandbox();

  afterEach(() => clean(sandbox));

  describe('getModifications', () => {
    it('should return modifications given changes', async () => {
      const document = await factory.create('synapsepay-document', {
        phoneNumber: '+1234567890',
        permission: 'UNVERIFIED',
        name: 'Bob Lobloblaw',
        licenseStatus: 'REVIEWING',
      });
      document.set({
        phoneNumber: '+0987654321',
        permission: 'SEND-AND-RECEIVE',
        name: 'Bobby Loblyblaw',
        licenseStatus: 'VALID',
      });
      const modifications = getModifications(document);
      await document.save();
      expect(modifications).to.deep.equal({
        phoneNumber: {
          previousValue: '+1234567890',
          currentValue: '+0987654321',
        },
        permission: {
          previousValue: 'UNVERIFIED',
          currentValue: 'SEND-AND-RECEIVE',
        },
        name: {
          previousValue: 'Bob Lobloblaw',
          currentValue: 'Bobby Loblyblaw',
        },
        licenseStatus: {
          previousValue: 'REVIEWING',
          currentValue: 'VALID',
        },
      });
    });

    it('should return empty modifications when there are no changes', async () => {
      const advance = await factory.create('advance');
      advance.set({});
      const modifications = getModifications(advance);
      await advance.save();
      expect(modifications).to.deep.equal({});
    });

    it('should return modfications only for properties that changed', async () => {
      const user = await factory.create('user', { phoneNumber: '+19998887777' });
      await user.set({ settings: {}, phoneNumber: '+11112223333' });
      const modifications = getModifications(user);
      await user.save();
      expect(modifications).to.deep.equal({
        phoneNumber: {
          previousValue: '+19998887777',
          currentValue: '+11112223333',
        },
      });
    });

    it('should exclude excluded fields', async () => {
      const user = await factory.create('user');
      await user.set({ fcmToken: 'longAssStringToken' });
      const modifications = getModifications(user, ['fcmToken']);
      await user.save();
      expect(modifications.fcmToken).to.not.exist;
      expect(user.fcmToken).to.equal('longAssStringToken');
    });
  });
});
