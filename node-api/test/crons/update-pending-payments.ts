import { clean } from '../test-helpers';
import factory from '../factories';
import * as sinon from 'sinon';
import * as Loomis from '@dave-inc/loomis-client';
import {
  PaymentGateway,
  PaymentProcessor,
  PaymentProviderTransactionStatus,
  PaymentProviderTransactionType,
} from '@dave-inc/loomis-client';
import * as JobData from '../../src/jobs/data';
import * as UpdatePendingPayments from '../../src/crons/update-pending-payments';
import { moment } from '@dave-inc/time-lib';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import BankAccount from '../../src/models/bank-account';

describe('UpdatePendingPayments', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());
  afterEach(() => clean(sandbox));

  it('queues an updatePaymentStatus task', async () => {
    const userSynapseId = '5d9be7e677ce003fa75f40e7';
    const synapseNodeId = '5d9be7e88d1b7d14da0e0ad5';
    const userId = 1;

    const user = await factory.create('user', {
      synapsepayId: userSynapseId,
      id: userId,
    });

    const bankAccount: BankAccount = await factory.create('checking-account', {
      synapseNodeId,
    });
    await bankAccount.update({ userId: user.id });

    const paymentMethod = await factory.create('payment-method', {
      tabapayId: 'yes-this-is-here',
      risepayId: null,
      userId: user.id,
      bankAccountId: bankAccount.id,
    });

    const advance = await factory.create('advance', {
      paymentMethodId: paymentMethod.id,
      bankAccountId: bankAccount.id,
      userId: user.id,
    });

    await factory.create('payment', {
      status: ExternalTransactionStatus.Pending,
      externalId: null,
      referenceId: 'test-ref-4',
      advanceId: advance.id,
      bankAccountId: bankAccount.id,
      created: moment()
        .subtract(1, 'hour')
        .toDate(),
    });

    await factory.create('payment', {
      status: ExternalTransactionStatus.Pending,
      externalId: null,
      referenceId: 'test-ref-4',
      advanceId: advance.id,
      bankAccountId: bankAccount.id,
      created: moment()
        .subtract(1, 'hour')
        .toDate(),
    });

    const tabapayStub = sandbox.stub().resolves({
      type: PaymentProviderTransactionType.AdvancePayment,
      externalId: 'T4ECOVMVCQGO2aV6k6vYGg',
      referenceId: null,
      amount: 0.1,
      gateway: PaymentGateway.Tabapay,
      processor: PaymentProcessor.Tabapay,
      status: PaymentProviderTransactionStatus.Completed,
    });

    sandbox
      .stub(Loomis, 'getPaymentGateway')
      .withArgs(PaymentGateway.Tabapay)
      .returns({ fetchTransaction: tabapayStub });

    const cupsStub = sandbox.stub(JobData, 'createUpdatePaymentStatusTask');

    await UpdatePendingPayments.run();

    sinon.assert.calledTwice(cupsStub);
  });
});
