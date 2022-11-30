import { checkReturnedPaymentForMultiAdvances } from '../../../src/domain/collection/multi-advance-check';
import Sinon, * as sinon from 'sinon';
import { clean } from '../../test-helpers';
import factory from '../../factories';
import { moment } from '@dave-inc/time-lib';

import * as ActiveCollection from '../../../src/domain/active-collection';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';

describe('checkReturnedPaymentForMultiAdvances', () => {
  const sandbox = sinon.createSandbox();
  let getActiveCollectionStub: Sinon.SinonStub;
  let setActiveCollectionStub: Sinon.SinonStub;
  const referenceId = 'reference_id';

  before(() => clean(sandbox));

  afterEach(() => clean(sandbox));

  it('does not attempt to check for an active collection if < 1 advance since returned payment creation', async () => {
    const payment = await factory.create('payment', { referenceId });
    getActiveCollectionStub = sandbox.stub(ActiveCollection, 'getActiveCollection').resolves(true);
    await checkReturnedPaymentForMultiAdvances(payment);
    sinon.assert.notCalled(getActiveCollectionStub);
  });

  it('does attempt to check for an active collection if there are mulit-advances', async () => {
    const user = await factory.create('user');
    const payment = await factory.create('payment', { referenceId, userId: user.id });
    getActiveCollectionStub = sandbox
      .stub(ActiveCollection, 'getActiveCollection')
      .resolves('fake-active-collection');

    const debitCard = await factory.create('payment-method');
    await factory.create('advance', {
      userId: user.id,
      bankAccountId: debitCard.bankAccountId,
      paymentMethodId: debitCard.id,
      disbursementStatus: ExternalTransactionStatus.Completed,
      created: moment(payment.created).add(1, 'day'),
    });

    await checkReturnedPaymentForMultiAdvances(payment);
    sinon.assert.calledOnce(getActiveCollectionStub);
  });

  it('if no active collection is set, it will set the active collection as the latest', async () => {
    const user = await factory.create('user');
    const payment = await factory.create('payment', { referenceId, userId: user.id });
    getActiveCollectionStub = sandbox.stub(ActiveCollection, 'isActiveCollection').resolves('');
    setActiveCollectionStub = sandbox.stub(ActiveCollection, 'setActiveCollection');
    const debitCard = await factory.create('payment-method');
    const advance = await factory.create('advance', {
      userId: user.id,
      bankAccountId: debitCard.bankAccountId,
      paymentMethodId: debitCard.id,
      disbursementStatus: ExternalTransactionStatus.Completed,
      created: moment(payment.created).add(1, 'day'),
    });

    await factory.create('advance-tip', {
      advanceId: advance.id,
      amount: 1.0,
    });

    await checkReturnedPaymentForMultiAdvances(payment);
    sinon.assert.calledOnce(setActiveCollectionStub);
    sinon.assert.calledWith(setActiveCollectionStub, `${advance.userId}`, `${advance.id}`);
  });
});
