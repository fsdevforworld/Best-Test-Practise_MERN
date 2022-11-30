import * as Loomis from '@dave-inc/loomis-client';
import {
  PaymentGateway,
  PaymentProcessor,
  PaymentProviderTransactionStatus,
  PaymentProviderTransactionType,
  CreateTransactionOptions,
} from '@dave-inc/loomis-client';
import PaymentProvider from '../../src/lib/payment-provider';
import * as Tabapay from '../../src/lib/tabapay';
import { moment } from '@dave-inc/time-lib';
import * as sinon from 'sinon';
import { PaymentMethod } from '../../src/models';
import { expect } from 'chai';
import { clean, up } from '../test-helpers';
import factory from '../factories';
import {
  ExternalTransactionProcessor,
  ExternalTransactionStatus,
  PaymentProviderDelivery,
} from '@dave-inc/wire-typings';
import { paymentMethodModelToType } from '../../src/typings';
import stubBankTransactionClient from '../test-helpers/stub-bank-transaction-client';
import * as TabapayACHExperiment from '../../src/experiments/tabapay-ach';

describe('Payment provider', () => {
  const sandbox = sinon.createSandbox();
  before(() => clean());

  beforeEach(() => {
    stubBankTransactionClient(sandbox);
    return up();
  });

  afterEach(() => clean(sandbox));

  describe('disburse', () => {
    context('when processing express delivery', () => {
      it('should use tabapay and succeed', async () => {
        const amount = 75;
        const delivery = PaymentProviderDelivery.EXPRESS;

        const user = await factory.create('user');
        const bankAccount = await factory.create('bank-account', { userId: user.id });
        const paymentMethodModel = await factory.create('payment-method', {
          userId: user.id,
          bankAccountId: bankAccount.id,
        });
        const paymentMethod = paymentMethodModelToType(paymentMethodModel);

        const referenceId = `${user.id}-${1}-${moment().unix()}`;
        const disburseStub = sandbox
          .stub(Tabapay, 'disburse')
          .withArgs(referenceId, paymentMethod.tabapayId, amount, paymentMethod.bin)
          .callsFake(_referenceId => {
            return {
              status: ExternalTransactionStatus.Completed,
              id: _referenceId,
              processor: ExternalTransactionProcessor.Tabapay,
            };
          });
        const disbursement = await PaymentProvider.disburse(
          user,
          bankAccount,
          paymentMethod,
          referenceId,
          amount,
          delivery,
        );

        expect(disbursement.status).to.equal(ExternalTransactionStatus.Completed);
        expect(disbursement.processor).to.eq(ExternalTransactionProcessor.Tabapay);
        expect(disbursement.id).to.equal(referenceId);
        expect(disburseStub).to.have.callCount(1);
      });
    });

    context('when processing standard delivery', () => {
      it.skip('should use tabapay ACH when user is in experiment bucket', async () => {
        const disbursementId = '472025B5-2925-4DE4-A389-74A7EC1C4AD8';

        sandbox.stub(TabapayACHExperiment, 'useTabapayDisbursementsACH').returns(true);
        sandbox
          .stub(Loomis, 'getPaymentGateway')
          .withArgs(PaymentGateway.TabapayACH)
          .returns({
            createTransaction: ({
              sourceId,
              referenceId: _referenceId,
              amount: _amount,
            }: CreateTransactionOptions) => {
              return {
                externalId: disbursementId,
                referenceId: _referenceId,
                amount: _amount,
                gateway: PaymentGateway.TabapayACH,
                processor: PaymentProcessor.TabapayACH,
                status: PaymentProviderTransactionStatus.Pending,
              };
            },
          });

        const amount = 75;
        const delivery = PaymentProviderDelivery.STANDARD;
        const paymentMethodId = 2001;
        const [user, bankAccount, paymentMethodModel] = await Promise.all([
          factory.build('user'),
          factory.create('bank-account'),
          PaymentMethod.findByPk(paymentMethodId),
        ]);

        const paymentMethod = paymentMethodModelToType(paymentMethodModel);
        const referenceId = `${user.id}-${1}-${moment().unix()}`;
        const disbursement = await PaymentProvider.disburse(
          user,
          bankAccount,
          paymentMethod,
          referenceId,
          amount,
          delivery,
        );

        expect(disbursement.status).to.equal(ExternalTransactionStatus.Pending);
        expect(disbursement.processor).to.eq(ExternalTransactionProcessor.TabapayACH);
        expect(disbursement.id).to.equal(disbursementId);
      });
    });
  });

  context('When disbursing to a Bank Of Dave Bank Account', () => {
    it('correctly routes the transaction to Bank Of Dave', async () => {
      const bodUserUuid = '2a82e635-d1dd-46c1-bc82-56f722a6e698';
      const bodAccountId = '0b39346b-9b00-4aee-a11e-0428fd13df81';
      const user = await factory.create('user');
      const { id: bankConnectionId } = await factory.create('bank-of-dave-bank-connection', {
        userId: user.id,
        externalId: bodUserUuid,
      });
      const bankAccount = await factory.create('bank-account', {
        bankConnectionId,
        userId: user.id,
        externalId: bodAccountId,
      });

      const delivery = PaymentProviderDelivery.EXPRESS;
      const referenceId = 'honey-foo-foo-0004'; // steven, you so funny!
      const amount = 75;

      const createTransaction = sandbox.stub().resolves({
        type: PaymentProviderTransactionType.AdvanceDisbursement,
        externalId: '82b2eba4-dd02-4874-a975-d037d1ab3fb1',
        referenceId,
        amount,
        gateway: PaymentGateway.BankOfDave,
        processor: PaymentProcessor.BankOfDave,
        status: PaymentProviderTransactionStatus.Pending,
      });
      sandbox.stub(Loomis, 'getPaymentGateway').returns({ createTransaction });

      const disbursement = await PaymentProvider.disburse(
        user,
        bankAccount,
        null,
        referenceId,
        amount,
        delivery,
      );
      expect(disbursement.status).to.eq(ExternalTransactionStatus.Pending);
      expect(disbursement.processor).to.eq(ExternalTransactionProcessor.BankOfDave);
      expect(disbursement.id).to.eq('82b2eba4-dd02-4874-a975-d037d1ab3fb1');
    });
  });
});
