import { expect, use } from 'chai';
import * as sinon from 'sinon';
import chaiAsPromised from 'chai-as-promised';

import { metrics, TabapayPaymentMethodMetrics } from '../../../src/domain/payment-method/metrics';
import * as Tabapay from '../../../src/lib/tabapay';
import { moment } from '@dave-inc/time-lib';
import { ConflictError } from '../../../src/lib/error';
import { addCardToTabapay } from '../../../src/domain/payment-method/add-card-to-tabapay';
import { User } from '../../../src/models';
import factory from '../../factories';
import { clean } from '../../test-helpers';

describe('addCardToTabapay', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());
  beforeEach(() => {});
  afterEach(() => clean(sandbox));

  context('has duplicate accounts', () => {
    it('should return the tabapay id of the card if the users from the duplicate accounts is the same user and were deleted 60 days ago', async () => {
      const metricsSpy = sandbox.spy(metrics, 'increment');
      const tabapayId = 'someFakeTabapayResponseId';
      const user = await factory.create<User>('user', {
        birthdate: moment('1983-11-12'),
        firstName: 'Jeffrey',
        lastName: 'Lee',
      });
      const dupUser = await factory.create<User>('user', {
        birthdate: user.birthdate,
        firstName: user.firstName,
        lastName: user.lastName,
        deleted: moment().subtract(60, 'days'),
      });

      await factory.create('payment-method', { userId: dupUser.id, tabapayId });

      sandbox
        .stub(Tabapay, 'createAccount')
        .onFirstCall()
        .rejects({
          response: { text: JSON.stringify({ SC: 409, duplicateAccountIDs: [tabapayId] }) },
        })
        .onSecondCall()
        .resolves(tabapayId);

      sandbox
        .stub(Tabapay, 'fetchAccount')
        .resolves({ owner: { phone: { number: 'fakeNumber' } } });

      const tabapayResponseId = await addCardToTabapay({
        referenceId: 'jeffReferenceId',
        encryptedCard: 'jeffSecretEncryptionCardData',
        keyId: 'jeffKeyId',
        user,
      });

      sinon.assert.calledWithExactly(
        metricsSpy,
        TabapayPaymentMethodMetrics.CREATE_ACCOUNT_DUPLICATE_ACCOUNT_ERROR_DELETED_60_DAYS,
      );
      expect(tabapayResponseId).to.be.eq(tabapayId);
    });

    it('should throw conflict error if the users from the duplicate accounts is the same user and were not deleted 60 days ago', async () => {
      use(() => chaiAsPromised);
      const metricsSpy = sandbox.spy(metrics, 'increment');
      const tabapayId = 'someFakeTabapayResponseId';
      const user = await factory.create<User>('user', {
        birthdate: moment('1983-11-12'),
        firstName: 'Jeffrey',
        lastName: 'Lee',
      });
      const dupUser = await factory.create<User>('user', {
        birthdate: user.birthdate,
        firstName: user.firstName,
        lastName: user.lastName,
        deleted: moment().subtract(30, 'days'),
      });

      await factory.create('payment-method', { userId: dupUser.id, tabapayId });

      sandbox
        .stub(Tabapay, 'createAccount')
        .onFirstCall()
        .rejects({
          response: { text: JSON.stringify({ SC: 409, duplicateAccountIDs: [tabapayId] }) },
        })
        .onSecondCall()
        .resolves(tabapayId);

      sandbox
        .stub(Tabapay, 'fetchAccount')
        .resolves({ owner: { phone: { number: 'fakeNumber' } } });

      await expect(
        addCardToTabapay({
          referenceId: 'jeffReferenceId',
          encryptedCard: 'jeffSecretEncryptionCardData',
          keyId: 'jeffKeyId',
          user,
        }),
      )
        .to.be.rejectedWith(new ConflictError('This card is in use with another account'))
        .and.not.have.property('data.existingAccounts');

      sinon.assert.calledWithExactly(
        metricsSpy,
        TabapayPaymentMethodMetrics.CREATE_ACCOUNT_DUPLICATE_ACCOUNT_ERROR,
      );
    });

    it('should throw a conflict error if none of the users from the duplicate accounts is the same user', async () => {
      use(() => chaiAsPromised);
      const metricsSpy = sandbox.spy(metrics, 'increment');
      const tabapayId = 'someFakeTabapayResponseId';
      const user = await factory.create<User>('user', {
        birthdate: moment('1983-11-12'),
        firstName: 'Jeffrey',
        lastName: 'Lee',
      });
      const dupUser = await factory.create<User>('user', {
        firstName: user.firstName,
        lastName: user.lastName,
        deleted: moment().subtract(60, 'days'),
      });

      await factory.create('payment-method', { userId: dupUser.id, tabapayId });

      sandbox
        .stub(Tabapay, 'createAccount')
        .onFirstCall()
        .rejects({
          response: { text: JSON.stringify({ SC: 409, duplicateAccountIDs: [tabapayId] }) },
        })
        .onSecondCall()
        .resolves(tabapayId);

      sandbox
        .stub(Tabapay, 'fetchAccount')
        .resolves({ owner: { phone: { number: 'fakeNumber' } } });

      await expect(
        addCardToTabapay({
          referenceId: 'jeffReferenceId',
          encryptedCard: 'jeffSecretEncryptionCardData',
          keyId: 'jeffKeyId',
          user,
        }),
      ).to.be.rejectedWith(ConflictError, 'This card is in use with another account');

      sinon.assert.calledWithExactly(
        metricsSpy.firstCall,
        TabapayPaymentMethodMetrics.CREATE_ACCOUNT_DUPLICATE_ACCOUNT_USERS_DO_NOT_MATCH,
      );
      sinon.assert.calledWithExactly(
        metricsSpy.secondCall,
        TabapayPaymentMethodMetrics.CREATE_ACCOUNT_DUPLICATE_ACCOUNT_ERROR,
      );
    });
  });
});
