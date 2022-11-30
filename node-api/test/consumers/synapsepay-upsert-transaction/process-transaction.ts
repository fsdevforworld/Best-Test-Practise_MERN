import { clean, fakeDateTime } from '../../test-helpers';
import { moment } from '@dave-inc/time-lib';
import * as sinon from 'sinon';
import { Message } from '@google-cloud/pubsub';
import twilio from '../../../src/lib/twilio';
import sendgrid from '../../../src/lib/sendgrid';
import * as analyticsClient from '../../../src/services/analytics/client';
import * as createTask from '../../../src/jobs/data';
import * as Jobs from '../../../src/jobs/data';
import {
  FraudAlertReason,
  SynapsepayTransactionStatus,
  SynapsepayTransactionStatusId,
} from '../../../src/typings';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import factory from '../../factories';
import * as uuid from 'uuid';
import { expect } from 'chai';
import { Alert, FraudAlert, User } from '../../../src/models';
import { snakeCase } from 'lodash';
import {
  findRecordForTransaction,
  processUpsertSynapsepayTransaction,
  transactionIsUnauthorized,
} from '../../../src/consumers/synapsepay-upsert-transaction/process-upsert-transaction';
import { TransactionWebhookData } from 'synapsepay';
import { collectSubscriptionPayment, paymentUpdateEvent } from '../../../src/domain/event';
import { dogstatsd } from '../../../src/lib/datadog-statsd';

describe('synapsepay transaction pubsub', () => {
  const sandbox = sinon.createSandbox();

  let createTaskStub: sinon.SinonStub;
  let paymentUpdateEventStub: sinon.SinonStub;
  let publishCollectStub: sinon.SinonStub;
  let jobStub: sinon.SinonStub;
  let dogstatsdStub: sinon.SinonStub;

  before(() => clean());

  beforeEach(() => {
    sandbox.stub(twilio, 'send');
    sandbox.stub(sendgrid, 'send');
    jobStub = sandbox.stub(createTask, 'refreshSanctionsScreening');
    createTaskStub = sandbox.stub(Jobs, 'broadcastPaymentChangedTask');
    publishCollectStub = sandbox.stub(collectSubscriptionPayment, 'publish').resolves();
    paymentUpdateEventStub = sandbox.stub(paymentUpdateEvent, 'publish').resolves();
    dogstatsdStub = sandbox.stub(dogstatsd, 'increment');
  });

  afterEach(() => clean(sandbox));

  describe('processUpsertSynapsepayTransaction', () => {
    ['advance', 'payment', 'reimbursement', 'subscription-payment'].forEach(recordType => {
      describe(recordType, () => {
        const statusField = recordType === 'advance' ? 'disbursementStatus' : 'status';

        [
          {
            status: SynapsepayTransactionStatus.QueuedBySynapse,
            statusId: SynapsepayTransactionStatusId.QueuedBySynapse,
            note: 'Q10-K Further investigation needed from Synapse',
            expectedStatus: ExternalTransactionStatus.Pending,
          },
          {
            status: SynapsepayTransactionStatus.QueuedByReceiver,
            statusId: SynapsepayTransactionStatusId.QueuedByReceiver,
            note: 'Q10-J Transaction queued until other sender transactions settle.',
            expectedStatus: ExternalTransactionStatus.Pending,
          },
          {
            status: SynapsepayTransactionStatus.Created,
            statusId: SynapsepayTransactionStatusId.Created,
            note: 'Transaction Created.',
            expectedStatus: ExternalTransactionStatus.Pending,
          },
          {
            status: SynapsepayTransactionStatus.ProcessingDebit,
            statusId: SynapsepayTransactionStatusId.ProcessingDebit,
            note: 'Next',
            expectedStatus: ExternalTransactionStatus.Pending,
          },
          {
            status: SynapsepayTransactionStatus.ProcessingCredit,
            statusId: SynapsepayTransactionStatusId.ProcessingCredit,
            note: 'Next',
            expectedStatus: ExternalTransactionStatus.Pending,
          },
          {
            status: SynapsepayTransactionStatus.Settled,
            statusId: SynapsepayTransactionStatusId.Settled,
            note: 'Next',
            expectedStatus: ExternalTransactionStatus.Completed,
          },
          {
            status: SynapsepayTransactionStatus.Canceled,
            statusId: SynapsepayTransactionStatusId.Canceled,
            note: 'C02 -- Unable to verify sender identity- please upload government ID',
            expectedStatus: ExternalTransactionStatus.Canceled,
          },
          {
            status: SynapsepayTransactionStatus.Canceled,
            statusId: SynapsepayTransactionStatusId.Canceled,
            note:
              ' C10 -- User is not allowed to send over 12.0 per 1 month(s). C10 -- User is not allowed to send over 24.0 per 1 year(s). C10 -- User is not allowed to send over 12.0 per 1 day(s).',
            expectedStatus: ExternalTransactionStatus.Canceled,
          },
          {
            status: SynapsepayTransactionStatus.Returned,
            statusId: SynapsepayTransactionStatusId.Returned,
            note: '[Returned on Debit] R01 --- Insufficient Funds',
            expectedStatus: ExternalTransactionStatus.Returned,
          },
        ].forEach(({ statusId, status, note, expectedStatus }) => {
          describe(`${status} (status_id: ${statusId})`, () => {
            it(`updates the ${statusField} to ${expectedStatus}`, async () => {
              const record = await createRecordType(recordType, {
                externalId: uuid(),
              });

              const synapseTransaction = await factory.build('synapsepay-transaction', {
                _id: record.externalId,
                recent_status: {
                  status,
                  status_id: statusId,
                  note,
                },
              });

              const webhookData = createTransactionWebhook(synapseTransaction);
              await processTransaction(webhookData);

              await record.reload({ paranoid: false });

              expect(record[statusField], `record.${statusField}`).to.equal(expectedStatus);
            });
            if (recordType !== 'advance') {
              it('saves the webhook data to the record', async () => {
                const record = await createRecordType(recordType, {
                  externalId: uuid(),
                  webhookData: null,
                });

                const synapseTransaction = await factory.build('synapsepay-transaction', {
                  _id: record.externalId,
                  recent_status: {
                    status,
                    status_id: statusId,
                    note,
                  },
                });

                const webhookData = createTransactionWebhook(synapseTransaction);
                await processTransaction(webhookData);

                await record.reload();

                expect(record.webhookData[0], 'record.webhookData[0]').to.deep.equal(webhookData);
              });

              it('appends the webhook data to the saved webhook data', async () => {
                const record = await createRecordType(recordType, {
                  externalId: uuid(),
                  webhookData: [{ foo: 'bar' }],
                });

                const synapseTransaction = await factory.build('synapsepay-transaction', {
                  _id: record.externalId,
                  recent_status: {
                    status,
                    status_id: statusId,
                    note,
                  },
                });

                const webhookData = createTransactionWebhook(synapseTransaction);
                await processTransaction(webhookData);

                await record.reload();

                expect(record.webhookData.length, 'record.webhookData.length').to.equal(2);
                expect(record.webhookData[1], 'record.webhookData[1]').to.deep.equal(webhookData);
              });
            }

            if (statusId === SynapsepayTransactionStatusId.Returned) {
              it('flags chargebacks as fraud', async () => {
                const record = await createRecordType(recordType, {
                  externalId: uuid(),
                });

                const synapseTransaction = await factory.build('synapsepay-transaction', {
                  _id: record.externalId,
                  recent_status: {
                    status: SynapsepayTransactionStatus.Returned,
                    status_id: SynapsepayTransactionStatusId.Returned,
                    note: '[Returned on Debit] R07 --- Authorization Revoked by Customer ',
                  },
                });

                await processTransaction(createTransactionWebhook(synapseTransaction));

                const user = await User.findOne({
                  where: { id: record.userId },
                  include: [FraudAlert],
                });

                expect(user.fraud, 'user.fraud').to.equal(true);
                expect(user.fraudAlerts.length, 'fraud alert count').to.equal(1);

                const [fraudAlert] = user.fraudAlerts;

                expect(fraudAlert.reason, 'fraudAlert.reason').to.equal(
                  FraudAlertReason.UnauthorizedTransactionReported,
                );
                expect(
                  fraudAlert.extra.unauthorizedRecord.id,
                  'fraudAlert.extra.unauthorizedRecord.id',
                ).to.equal(record.id);
                expect(
                  fraudAlert.extra.transactionType,
                  'fraudAlert.extra.transactionType',
                ).to.equal(snakeCase(recordType));
              });
            }

            if (statusId === SynapsepayTransactionStatusId.Canceled) {
              it('enqueues a job to check the sanctions screening list for the user', async () => {
                const record = await createRecordType(recordType, {
                  externalId: uuid(),
                });

                const synapseTransaction = await factory.build('synapsepay-transaction', {
                  _id: record.externalId,
                  recent_status: {
                    status,
                    status_id: statusId,
                    note,
                  },
                });

                await processTransaction(createTransactionWebhook(synapseTransaction));

                const jobArgs = jobStub.firstCall.args[0];
                expect(jobArgs.userId).to.equal(record.userId);
              });
            }
          });
        });
      });
    });

    it('updates the advance outstanding amount for returned payments', async () => {
      const advance = await factory.create('advance', {
        amount: 50,
        fee: 0,
        outstanding: 0,
      });

      const [payment] = await Promise.all([
        factory.create('payment', {
          advanceId: advance.id,
          externalId: uuid(),
          amount: 50,
          status: ExternalTransactionStatus.Completed,
        }),
        factory.create('advance-tip', { advanceId: advance.id, amount: 0, percent: 0 }),
      ]);

      const synapseTransaction = await factory.build('synapsepay-transaction', {
        _id: payment.externalId,
        recent_status: {
          status: SynapsepayTransactionStatus.Returned,
          status_id: SynapsepayTransactionStatusId.Returned,
          note: '[Returned on Debit] R07 --- Authorization Revoked by Customer ',
        },
      });

      await processTransaction(createTransactionWebhook(synapseTransaction));

      await advance.reload();

      expect(advance.outstanding, 'advance.outstanding').to.equal(50);
    });

    it('enqueues a job to collect debit only for failed ach', async () => {
      const record = await createRecordType('subscription-payment', {
        externalId: uuid(),
      });

      const synapseTransaction = await factory.build('synapsepay-transaction', {
        _id: record.externalId,
        recent_status: {
          status: SynapsepayTransactionStatus.Canceled,
          statusId: SynapsepayTransactionStatusId.Canceled,
          note: 'cheese',
        },
      });

      await processTransaction(createTransactionWebhook(synapseTransaction));

      const [billing] = await record.getSubscriptionBillings();
      sinon.assert.calledWith(publishCollectStub, {
        subscriptionBillingId: billing.id,
        forceDebitOnly: true,
      });
    });

    it('webhook does not nullify external id for advance payment', async () => {
      const advance = await factory.create('advance', {
        amount: 50,
        fee: 0,
        outstanding: 0,
      });

      const [payment] = await Promise.all([
        factory.create('payment', {
          advanceId: advance.id,
          externalId: uuid(),
          amount: 50,
          status: ExternalTransactionStatus.Pending,
        }),
        factory.create('advance-tip', { advanceId: advance.id, amount: 0, percent: 0 }),
      ]);

      expect(payment.externalId).not.to.be.null;
      const oldId = payment.externalId;

      const synapseTransaction = await factory.build('synapsepay-transaction', {
        _id: payment.externalId,
        recent_status: {
          status: SynapsepayTransactionStatus.Returned,
          status_id: SynapsepayTransactionStatusId.Returned,
          note: '[Returned on Debit] R07 --- Authorization Revoked by Customer ',
        },
      });

      await processTransaction(createTransactionWebhook(synapseTransaction));

      await payment.reload();
      expect(payment.status).to.equal(ExternalTransactionStatus.Returned);
      expect(payment.externalId).to.eq(oldId);
    });

    it('will not update payment webhookData if the same webhook comes twice', async () => {
      const payment = await factory.create('payment', {
        externalId: uuid(),
        amount: 50,
        status: ExternalTransactionStatus.Returned,
        webhookData: [],
      });

      const synapseTransaction = await factory.build('synapsepay-transaction', {
        _id: payment.externalId,
        recent_status: {
          status: SynapsepayTransactionStatus.Returned,
          status_id: SynapsepayTransactionStatusId.Returned,
          note: '[Returned on Debit] R07 --- Authorization Revoked by Customer ',
        },
      });

      await processTransaction(createTransactionWebhook(synapseTransaction));

      await payment.reload();
      expect(payment.webhookData.length).to.eq(1);

      await processTransaction(synapseTransaction);

      await payment.reload();
      expect(payment.webhookData.length).to.eq(1);
    });

    it('should send out an alert if a payment is returned', async () => {
      const payment = await factory.create('payment', {
        externalId: uuid(),
        amount: 40,
        status: ExternalTransactionStatus.Completed,
      });
      await factory.create('advance-tip', { advanceId: payment.advanceId });

      const synapseTransaction = await factory.build('synapsepay-transaction', {
        _id: payment.externalId,
        recent_status: {
          status: SynapsepayTransactionStatus.Returned,
          status_id: SynapsepayTransactionStatusId.Returned,
          note: '[Returned on Debit] R07 --- Authorization Revoked by Customer ',
        },
      });

      await processTransaction(createTransactionWebhook(synapseTransaction));

      await payment.reload();

      const alerts = await Alert.findAll({ where: { eventUuid: payment.id } });
      expect(alerts.length).to.equal(2);
    });

    it('should send out an alert if an advance is returned', async () => {
      const analyticsStub = sandbox.stub(analyticsClient, 'track').resolves();
      const externalId = uuid();
      const advance = await factory.create('advance', { externalId, outstanding: 100 });
      await factory.create('advance-tip', { advanceId: advance.id });

      const synapseTransaction = await factory.build('synapsepay-transaction', {
        _id: externalId,
        recent_status: {
          status: SynapsepayTransactionStatus.Returned,
          status_id: SynapsepayTransactionStatusId.Returned,
          note: '[Returned on Debit] R07 --- Authorization Revoked by Customer ',
        },
      });

      const webhookData = createTransactionWebhook(synapseTransaction);

      await processTransaction(webhookData);

      await advance.reload({ paranoid: false });

      expect(advance.disbursementStatus, 'advance.disbursementStatus').to.equal('RETURNED');
      expect(analyticsStub).to.have.been.calledWith({
        userId: String(advance.userId),
        event: 'advance disburse failed',
        context: { traits: sinon.match.object },
      });
    });

    it('creates a broadcastPaymentChanged task', async () => {
      const time = moment();
      const externalId = uuid();
      const advance = await factory.create('advance', { outstanding: 100 });
      const payment = await factory.create('payment', { externalId, amount: 40 });
      fakeDateTime(sandbox, time);
      await Promise.all([
        factory.create('advance-tip', { advanceId: advance.id }),
        factory.create('advance-tip', { advanceId: payment.advanceId }),
      ]);

      const synapseTransaction = await factory.build('synapsepay-transaction', {
        _id: externalId,
        recent_status: {
          status: SynapsepayTransactionStatus.Returned,
          status_id: SynapsepayTransactionStatusId.Returned,
          note: '[Returned on Debit] R07 --- Authorization Revoked by Customer ',
        },
      });

      const webhookData = createTransactionWebhook(synapseTransaction);

      await processTransaction(webhookData);

      sinon.assert.calledOnce(createTaskStub);
      sinon.assert.calledWith(createTaskStub, { paymentId: payment.id, time: time.format() });
      sinon.assert.calledOnce(paymentUpdateEventStub);
    });
  });

  it('emits a metric for an updated payment', async () => {
    const advance = await factory.create('advance', {
      amount: 50,
      fee: 0,
      outstanding: 0,
    });

    const [payment] = await Promise.all([
      factory.create('payment', {
        advanceId: advance.id,
        externalId: uuid(),
        amount: 50,
        status: ExternalTransactionStatus.Completed,
      }),
      factory.create('advance-tip', { advanceId: advance.id, amount: 0, percent: 0 }),
    ]);

    const synapseTransaction = await factory.build('synapsepay-transaction', {
      _id: payment.externalId,
      recent_status: {
        status: SynapsepayTransactionStatus.Returned,
        status_id: SynapsepayTransactionStatusId.Returned,
        note: '[Returned on Debit] R07 --- Authorization Revoked by Customer ',
      },
    });

    await processTransaction(createTransactionWebhook(synapseTransaction));

    sinon.assert.calledThrice(dogstatsdStub);
    sinon.assert.calledWithExactly(
      dogstatsdStub.thirdCall,
      'pubsub.synapsepay.webhook.update_payment',
      1,
      ['previous_status:COMPLETED', 'status:RETURNED'],
    );
  });

  describe('findRecordForTransaction', () => {
    ['advance', 'payment', 'subscription-payment'].forEach(model => {
      it(`finds the matching ${model}`, async () => {
        const externalId = uuid();
        const record = await factory.create(model, {
          externalId,
        });

        const synapseTransaction = await factory.build('synapsepay-transaction', {
          _id: externalId,
        });

        const foundRecord = await findRecordForTransaction(synapseTransaction);

        expect(record.id, 'record id').to.equal(foundRecord.id);
      });
    });

    it('is null when no record is located', async () => {
      const externalId = uuid();

      const synapseTransaction = await factory.build('synapsepay-transaction', {
        _id: externalId,
      });

      const foundRecord = await findRecordForTransaction(synapseTransaction);

      expect(foundRecord, 'record id').to.equal(null);
    });
  });

  describe('transactionIsUnauthorized', () => {
    [
      '[Returned on Debit] R10 --- Customer Advises Not Authorized',
      '[Returned on Debit] R07 --- Authorization Revoked by Customer ',
    ].forEach(note => {
      it(`correctly recognizes unuathorized transactions with a note of: ${note}`, async () => {
        const synapseTransaction = await factory.build('synapsepay-transaction', {
          recent_status: {
            note,
            status_id: SynapsepayTransactionStatusId.Returned,
            status: SynapsepayTransactionStatus.Returned,
            date: 1490830664676,
          },
        });

        expect(transactionIsUnauthorized(synapseTransaction)).to.equal(true);
      });
    });

    it('status is not RETURNED', async () => {
      const synapseTransaction = await factory.build('synapsepay-transaction', {
        recent_status: {
          status: SynapsepayTransactionStatus.Settled,
          note: '[Returned on Debit] R10 --- Customer Advises Not Authorized',
          status_id: SynapsepayTransactionStatusId.Settled,
          date: 1490830664676,
        },
      });

      expect(transactionIsUnauthorized(synapseTransaction)).to.equal(false);
    });

    it('return code is not unauthorized', async () => {
      const synapseTransaction = await factory.build('synapsepay-transaction', {
        recent_status: {
          note: '[Returned on Debit] R01 --- Insufficient Funds',
          status_id: SynapsepayTransactionStatusId.Returned,
          status: SynapsepayTransactionStatus.Returned,
          date: 1490830664676,
        },
      });

      expect(transactionIsUnauthorized(synapseTransaction)).to.equal(false);
    });
  });

  async function processTransaction(data: TransactionWebhookData) {
    const ackStub = sandbox.stub();
    const nackStub = sandbox.stub();
    const message: Message = { nack: nackStub, ack: ackStub, data: null } as any;
    await processUpsertSynapsepayTransaction(message, data);

    return { ackStub, nackStub };
  }

  function createTransactionWebhook(transaction: any): TransactionWebhookData {
    return {
      _id: {
        $oid: transaction._id,
      },
      _rest: transaction,
    } as any;
  }

  async function createRecordType(recordType: string, params: object) {
    const record = await factory.create(recordType, params);

    if (recordType === 'advance') {
      await factory.create('advance-tip', { advanceId: record.id });
    }

    if (recordType === 'payment') {
      await factory.create('advance-tip', { advanceId: record.advanceId });
    }

    return record;
  }
});
