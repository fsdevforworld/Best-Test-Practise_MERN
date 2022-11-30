import { clean } from '../test-helpers';
import factory from '../factories';
import * as sinon from 'sinon';
import * as JobData from '../../src/jobs/data';
import * as UpdateCompletedSynapsePayments from '../../src/crons/update-completed-synapse-payments';
import { moment } from '@dave-inc/time-lib';
import { ExternalTransactionStatus, ExternalTransactionProcessor } from '@dave-inc/wire-typings';
import BankAccount from '../../src/models/bank-account';
import logger from '../../src/lib/logger';
import sendgrid from '../../src/lib/sendgrid';

describe('UpdateCompletedSynapsePayments', () => {
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
      risepayId: null,
      userId: user.id,
      bankAccountId: bankAccount.id,
    });

    const advance = await factory.create('advance', {
      paymentMethodId: paymentMethod.id,
      bankAccountId: bankAccount.id,
      userId: user.id,
    });

    const tooOldPayment = {
      status: ExternalTransactionStatus.Completed,
      externalProcessor: ExternalTransactionProcessor.Synapsepay,
      referenceId: 'test-ref-4',
      advanceId: advance.id,
      bankAccountId: bankAccount.id,
      created: moment()
        .subtract(6, 'days')
        .subtract(10, 'minute')
        .toDate(),
    };
    await factory.create('payment', tooOldPayment);

    const tooRecentPayment = {
      status: ExternalTransactionStatus.Completed,
      externalProcessor: ExternalTransactionProcessor.Synapsepay,
      referenceId: 'test-ref-4',
      advanceId: advance.id,
      bankAccountId: bankAccount.id,
      created: moment()
        .subtract(1, 'minute')
        .toDate(),
    };
    await factory.create('payment', tooRecentPayment);

    const notSynapsePayment = {
      status: ExternalTransactionStatus.Completed,
      externalProcessor: ExternalTransactionProcessor.Tabapay,
      referenceId: 'test-ref-4',
      advanceId: advance.id,
      bankAccountId: bankAccount.id,
      created: moment()
        .subtract(10, 'minute')
        .toDate(),
    };
    await factory.create('payment', notSynapsePayment);

    const notCompletedPayment = {
      status: ExternalTransactionStatus.Pending,
      externalProcessor: ExternalTransactionProcessor.Synapsepay,
      referenceId: 'test-ref-4',
      advanceId: advance.id,
      bankAccountId: bankAccount.id,
      created: moment()
        .subtract(10, 'minute')
        .toDate(),
    };
    await factory.create('payment', notCompletedPayment);

    const expectedPayment = await factory.create('payment', {
      status: ExternalTransactionStatus.Completed,
      externalProcessor: ExternalTransactionProcessor.Synapsepay,
      referenceId: 'test-ref-5',
      advanceId: advance.id,
      bankAccountId: bankAccount.id,
      created: moment()
        .subtract(6, 'days')
        .add(10, 'minute')
        .toDate(),
    });
    const expectedPayment2 = await factory.create('payment', {
      status: ExternalTransactionStatus.Completed,
      externalProcessor: ExternalTransactionProcessor.Synapsepay,
      referenceId: 'test-ref-5',
      advanceId: advance.id,
      bankAccountId: bankAccount.id,
      created: moment()
        .subtract(10, 'minute')
        .toDate(),
    });

    const cupsStub = sandbox.stub(JobData, 'createUpdatePaymentStatusTask');
    const loggerStub = sandbox.stub(logger, 'info');
    const sendgridStub = sandbox.stub(sendgrid, 'sendHtml');

    await UpdateCompletedSynapsePayments.run();

    sinon.assert.calledTwice(cupsStub);
    sinon.assert.calledWith(cupsStub, { paymentId: expectedPayment.dataValues?.id });
    sinon.assert.calledWith(cupsStub, { paymentId: expectedPayment2.dataValues?.id });

    sinon.assert.calledTwice(loggerStub);
    sinon.assert.calledWith(loggerStub, 'creating update payment status task', {
      paymentId: expectedPayment.dataValues?.id,
    });
    sinon.assert.calledWith(loggerStub, 'creating update payment status task', {
      paymentId: expectedPayment2.dataValues?.id,
    });

    sinon.assert.calledOnce(sendgridStub);
    sinon.assert.calledWithMatch(
      sendgridStub,
      sinon.match(/Completed Synapse Payments To Be Updated from.*to.*/),
      sinon.match(
        /<a href="https:\/\/p.datadoghq.com\/sb\/abe510f47-63b847c72d2cdde660199fa0c6eda9d7">See dashboard<\/a><br>.*<br>.*/,
      ),
      sinon.match(['returned-payment-status@dave.com']),
    );
  });
});
