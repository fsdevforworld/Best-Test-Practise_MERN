import * as Loomis from '@dave-inc/loomis-client';
import * as sinon from 'sinon';
import factory from '../factories';
import {
  PaymentGateway,
  PaymentProcessor,
  PaymentProviderTransaction,
  PaymentProviderTransactionStatus,
  PaymentProviderTransactionType,
} from '../../src/typings';
import { moment } from '@dave-inc/time-lib';
import { updateDisbursementStatus } from '../../src/jobs/handlers';
import { expect } from 'chai';
import * as Notification from '../../src/domain/notifications';
import { ExternalTransactionProcessor, ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { clean } from '../test-helpers';

describe('job: update-disbursement-status', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());
  beforeEach(() => {
    sandbox.stub(Notification, 'sendAdvanceDisbursementFailed').resolves();
  });

  afterEach(() => clean(sandbox));

  const updatedStatus = PaymentProviderTransactionStatus.Completed;
  const externalId = 'shrimp-payroll';

  it('updates the status, externalId of a pending advance to a Dave Banking account', async () => {
    const advance = await factory.create('advance', {
      disbursementProcessor: ExternalTransactionProcessor.BankOfDave,
      disbursementStatus: ExternalTransactionStatus.Pending,
      externalId,
    });

    const job = { advanceId: advance.id };

    const processor = PaymentProcessor.BankOfDave;
    const successfulResponse = { status: updatedStatus, externalId, processor };
    // Thank you Jesus, Satan, Buddha, whoever for allowing this stubbing to work
    const paymentGatewayStub = sandbox.stub().resolves(successfulResponse);
    sandbox
      .stub(Loomis, 'getPaymentGateway')
      .withArgs(PaymentGateway.BankOfDave)
      .returns({ fetchTransaction: paymentGatewayStub });

    const bankAccount = await advance.getBankAccount();
    const { externalId: ownerId } = await bankAccount.getBankConnection();
    await updateDisbursementStatus(job);

    await advance.reload();

    expect(advance.disbursementStatus).to.eq(updatedStatus);
    expect(advance.externalId).to.eq(externalId);
    expect(paymentGatewayStub.callCount).to.eq(1);
    expect(paymentGatewayStub.firstCall.args[0]).to.deep.include({
      externalId,
      type: PaymentProviderTransactionType.AdvanceDisbursement,
      processor,
      referenceId: advance.referenceId,
      ownerId,
      sourceId: bankAccount.externalId,
      correspondingId: undefined,
    });
  });

  it.skip('updates the status, externalId of a pending advance on a TabaPay ACH transaction', async () => {
    const advance = await factory.create('advance', {
      disbursementProcessor: ExternalTransactionProcessor.TabapayACH,
      disbursementStatus: ExternalTransactionStatus.Pending,
      externalId,
    });

    const job = { advanceId: advance.id };

    const processor = PaymentProcessor.TabapayACH;
    const successfulResponse = { status: updatedStatus, externalId, processor };
    const paymentGatewayStub = sandbox.stub().resolves(successfulResponse);
    sandbox
      .stub(Loomis, 'getPaymentGateway')
      .withArgs(PaymentGateway.TabapayACH)
      .returns({ fetchTransaction: paymentGatewayStub });

    await updateDisbursementStatus(job);
    await advance.reload();

    expect(advance.disbursementStatus).to.eq(updatedStatus);
    expect(advance.externalId).to.eq(externalId);
    expect(paymentGatewayStub.callCount).to.eq(1);
    expect(paymentGatewayStub.firstCall.args[0]).to.deep.include({
      externalId,
      type: PaymentProviderTransactionType.AdvanceDisbursement,
      processor,
      referenceId: advance.referenceId,
    });
  });

  it('makes no updates when advance.disbursementStatus is unchanged', async () => {
    const advance = await factory.create('advance', {
      disbursementProcessor: ExternalTransactionProcessor.BankOfDave,
      disbursementStatus: ExternalTransactionStatus.Pending,
      externalId,
    });

    const job = { advanceId: advance.id };

    const processor = PaymentProcessor.BankOfDave;
    const successfulResponse = {
      status: PaymentProviderTransactionStatus.Pending,
      externalId,
      processor,
    };
    const fetchTransaction = sandbox.stub().resolves(successfulResponse);
    sandbox
      .stub(Loomis, 'getPaymentGateway')
      .withArgs(PaymentGateway.BankOfDave)
      .returns({ fetchTransaction });

    await updateDisbursementStatus(job);

    await advance.reload();

    expect(advance.disbursementStatus).to.eq(ExternalTransactionStatus.Pending);
  });

  it('cancels and soft-deletes the advance when the gateway cannot find it', async () => {
    const advance = await factory.create('advance', {
      disbursementProcessor: ExternalTransactionProcessor.BankOfDave,
      disbursementStatus: ExternalTransactionStatus.Pending,
      externalId,
    });

    const job = { advanceId: advance.id };

    const notFoundResponse: PaymentProviderTransaction = {
      type: PaymentProviderTransactionType.AdvancePayment,
      externalId,
      referenceId: advance.referenceId,
      amount: null,
      gateway: PaymentGateway.BankOfDave,
      outcome: null,
      processor: PaymentProcessor.BankOfDave,
      raw: { status: 404, message: 'NotFound' },
      reversalStatus: null,
      status: PaymentProviderTransactionStatus.NotFound,
    };

    const fetchTransaction = sandbox.stub().resolves(notFoundResponse);
    sandbox
      .stub(Loomis, 'getPaymentGateway')
      .withArgs(PaymentGateway.BankOfDave)
      .returns({ fetchTransaction });

    await updateDisbursementStatus(job);

    await advance.reload({ paranoid: false });

    expect(advance.disbursementStatus).to.eq(ExternalTransactionStatus.Canceled);

    const hasDeletedTimestamp = moment().diff(advance.deleted, 'days') === 0;

    expect(hasDeletedTimestamp).to.equal(true);
  });

  it('sets status to failed if status is failed', async () => {
    const advance = await factory.create('advance', {
      disbursementProcessor: ExternalTransactionProcessor.BankOfDave,
      disbursementStatus: ExternalTransactionStatus.Pending,
      externalId,
    });

    const job = { advanceId: advance.id };

    const notFoundResponse: PaymentProviderTransaction = {
      type: PaymentProviderTransactionType.AdvancePayment,
      externalId,
      referenceId: advance.referenceId,
      amount: null,
      gateway: PaymentGateway.BankOfDave,
      outcome: null,
      processor: PaymentProcessor.BankOfDave,
      reversalStatus: null,
      status: PaymentProviderTransactionStatus.Failed,
    };

    const fetchTransaction = sandbox.stub().resolves(notFoundResponse);
    sandbox
      .stub(Loomis, 'getPaymentGateway')
      .withArgs(PaymentGateway.BankOfDave)
      .returns({ fetchTransaction });

    await updateDisbursementStatus(job);

    await advance.reload({ paranoid: false });

    expect(advance.disbursementStatus).to.eq(ExternalTransactionStatus.Canceled);

    const hasDeletedTimestamp = moment().diff(advance.deleted, 'days') === 0;

    expect(hasDeletedTimestamp).to.equal(true);
  });
});
