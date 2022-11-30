import { expect } from 'chai';
import { ExternalTransactionProcessor } from '@dave-inc/wire-typings';
import { PaymentMethodType } from '@dave-inc/loomis-client';
import { clean } from '../../../../test-helpers';
import factory from '../../../../factories';
import { paymentMethodSerializers } from '../../../../../src/services/internal-dashboard-api/serializers';
import {
  Advance,
  BankAccount,
  Payment,
  Reimbursement,
  SubscriptionPayment,
  User,
} from '../../../../../src/models';
import { disbursementProcessors } from '../../../../../src/models/advance';
import { paymentExternalProcessors } from '../../../../../src/models/payment';
import {
  reimbursementProcessors,
  ReimbursementExternalProcessor,
  ReimbursementPayableType,
} from '../../../../../src/models/reimbursement';
import { subscriptionPaymentExternalProcessors } from '../../../../../src/models/subscription-payment';

describe('serializeUniversalId', () => {
  beforeEach(() => clean());

  const { serializeUniversalId } = paymentMethodSerializers;

  context('Advance', () => {
    const scenarios = [
      {
        disbursementProcessor: ExternalTransactionProcessor.BankOfDave,
        expectedPrefix: PaymentMethodType.DAVE_BANKING,
      },
      {
        disbursementProcessor: ExternalTransactionProcessor.Blastpay,
        expectedPrefix: PaymentMethodType.DEBIT_CARD,
      },
      {
        disbursementProcessor: ExternalTransactionProcessor.Payfi,
        expectedPrefix: PaymentMethodType.DEBIT_CARD,
      },
      {
        disbursementProcessor: ExternalTransactionProcessor.Risepay,
        expectedPrefix: PaymentMethodType.DEBIT_CARD,
      },

      {
        disbursementProcessor: ExternalTransactionProcessor.Synapsepay,
        expectedPrefix: PaymentMethodType.BANK_ACCOUNT,
      },
      {
        disbursementProcessor: ExternalTransactionProcessor.Tabapay,
        expectedPrefix: PaymentMethodType.DEBIT_CARD,
      },
    ];

    describe('returns correct universalId for disbursementProcessor', () => {
      scenarios.forEach(({ disbursementProcessor, expectedPrefix }) => {
        it(`${disbursementProcessor}`, async () => {
          const bankAccount = await factory.create<BankAccount>('bank-account');

          let resourceId = bankAccount.id;
          let paymentMethodId: number;
          if (expectedPrefix === PaymentMethodType.DEBIT_CARD) {
            const debitCard = await factory.create('payment-method');
            paymentMethodId = debitCard.id;
            resourceId = debitCard.id;
          }

          const advance = await factory.create<Advance>('advance', {
            paymentMethodId,
            bankAccountId: bankAccount.id,
            disbursementProcessor,
          });

          const id = serializeUniversalId(advance);

          expect(id).to.equal(`${expectedPrefix}:${resourceId}`);
        });
      });
    });

    it('all disbursementProcessors tested', () => {
      expect(disbursementProcessors.length).to.equal(scenarios.length);
    });

    it('returns null if the processor uses debit and the debit card is missing', async () => {
      const advance = await factory.create<Advance>('advance', {
        paymentMethodId: null,
        disbursementProcessor: ExternalTransactionProcessor.Tabapay,
      });

      const id = serializeUniversalId(advance);

      expect(id).to.be.null;
    });

    it('returns null if the processor uses the bank account and it is missing', async () => {
      const advance = await factory.create<Advance>('advance', {
        bankAccountId: null,
        disbursementProcessor: ExternalTransactionProcessor.Synapsepay,
      });

      const id = serializeUniversalId(advance);

      expect(id).to.be.null;
    });

    it('returns null if the disbursementProcessor field is null', async () => {
      const [bankAccount, debitCard] = await Promise.all([
        factory.create('bank-account'),
        factory.create('payment-method'),
      ]);

      const advance = await factory.create<Advance>('advance', {
        disbursementProcessor: null,
        bankAccountId: bankAccount.id,
        paymentMethodId: debitCard.id,
      });

      const id = serializeUniversalId(advance);

      expect(id).to.be.null;
    });
  });

  context('Payment', () => {
    const scenarios = [
      {
        externalProcessor: ExternalTransactionProcessor.BankOfDave,
        expectedPrefix: PaymentMethodType.DAVE_BANKING,
      },
      {
        externalProcessor: ExternalTransactionProcessor.Synapsepay,
        expectedPrefix: PaymentMethodType.BANK_ACCOUNT,
      },
      {
        externalProcessor: ExternalTransactionProcessor.Tabapay,
        expectedPrefix: PaymentMethodType.DEBIT_CARD,
      },
    ];

    describe('returns correct universalId for externalProcessor', () => {
      scenarios.forEach(({ externalProcessor, expectedPrefix }) => {
        it(`${externalProcessor}`, async () => {
          const bankAccount = await factory.create<BankAccount>('bank-account');

          let resourceId = bankAccount.id;
          let paymentMethodId: number;
          if (expectedPrefix === PaymentMethodType.DEBIT_CARD) {
            const debitCard = await factory.create('payment-method');
            paymentMethodId = debitCard.id;
            resourceId = debitCard.id;
          }

          const payment = await factory.create<Payment>('payment', {
            paymentMethodId,
            bankAccountId: bankAccount.id,
            externalProcessor,
          });

          const id = serializeUniversalId(payment);

          expect(id).to.equal(`${expectedPrefix}:${resourceId}`);
        });
      });
    });

    it('all paymentExternalProcessors tested', () => {
      expect(paymentExternalProcessors.length).to.equal(scenarios.length);
    });

    it('returns null if the processor uses debit and the debit card is missing', async () => {
      const payment = await factory.create<Payment>('payment', {
        paymentMethodId: null,
        externalProcessor: ExternalTransactionProcessor.Tabapay,
      });

      const id = serializeUniversalId(payment);

      expect(id).to.be.null;
    });

    it('returns null if the processor uses the bank account and it is missing', async () => {
      const payment = await factory.create<Payment>('payment', {
        bankAccountId: null,
        externalProcessor: ExternalTransactionProcessor.Synapsepay,
      });

      const id = serializeUniversalId(payment);

      expect(id).to.be.null;
    });

    it('returns null if the externalProcessor field is null', async () => {
      const [bankAccount, debitCard] = await Promise.all([
        factory.create('bank-account'),
        factory.create('payment-method'),
      ]);

      const payment = await factory.create<Payment>('payment', {
        externalProcessor: null,
        bankAccountId: bankAccount.id,
        paymentMethodId: debitCard.id,
      });

      const id = serializeUniversalId(payment);

      expect(id).to.be.null;
    });
  });

  context('Reimbursement', () => {
    const scenarios = [
      {
        reimbursementProcessor: ReimbursementExternalProcessor.Tabapay,
        expectedPrefix: PaymentMethodType.DEBIT_CARD,
      },
      {
        reimbursementProcessor: ReimbursementExternalProcessor.Synapsepay,
        expectedPrefix: PaymentMethodType.BANK_ACCOUNT,
      },
      {
        reimbursementProcessor: ReimbursementExternalProcessor.Blastpay,
        expectedPrefix: PaymentMethodType.DEBIT_CARD,
      },
      {
        reimbursementProcessor: ReimbursementExternalProcessor.Paypal,
        expectedPrefix: null,
      },
      {
        reimbursementProcessor: ReimbursementExternalProcessor.BankOfDave,
        expectedPrefix: PaymentMethodType.DAVE_BANKING,
      },
      {
        reimbursementProcessor: ReimbursementExternalProcessor.Risepay,
        expectedPrefix: PaymentMethodType.DEBIT_CARD,
      },
      {
        reimbursementProcessor: ReimbursementExternalProcessor.Payfi,
        expectedPrefix: PaymentMethodType.DEBIT_CARD,
      },
    ];

    scenarios.forEach(({ reimbursementProcessor, expectedPrefix }) => {
      it(`${reimbursementProcessor}`, async () => {
        let payableId;
        let payableType;

        if (expectedPrefix === PaymentMethodType.DEBIT_CARD) {
          const resource = await factory.create('payment-method');

          payableType = ReimbursementPayableType.PAYMENT_METHOD;
          payableId = resource.id;
        } else if (
          expectedPrefix === PaymentMethodType.BANK_ACCOUNT ||
          expectedPrefix === PaymentMethodType.DAVE_BANKING
        ) {
          const resource = await factory.create('bank-account');

          payableType = ReimbursementPayableType.BANK_ACCOUNT;
          payableId = resource.id;
        }

        const reimbursement = await factory.create<Reimbursement>('reimbursement', {
          payableType,
          payableId,
          externalProcessor: reimbursementProcessor,
        });

        const id = serializeUniversalId(reimbursement);

        if (expectedPrefix === null) {
          // Paypal transactions have no payment methods
          expect(id).to.be.null;
        } else {
          expect(id).to.equal(`${expectedPrefix}:${payableId}`);
        }
      });
    });

    it('all reimbursementProcessors tested', () => {
      expect(reimbursementProcessors.length).to.equal(scenarios.length);
    });

    it('returns null if the payableId is missing', async () => {
      const reimbursement = await factory.create<Reimbursement>('reimbursement', {
        payableId: null,
        payableType: ReimbursementPayableType.PAYMENT_METHOD,
        externalProcessor: ReimbursementExternalProcessor.Tabapay,
      });

      const id = serializeUniversalId(reimbursement);

      expect(id).to.be.null;
    });

    it('returns null if the reimbursementProcessor is missing', async () => {
      const debitCard = await factory.create('payment-method');

      const reimbursement = await factory.create<Reimbursement>('reimbursement', {
        payableId: debitCard.id,
        payableType: ReimbursementPayableType.PAYMENT_METHOD,
        externalProcessor: null,
      });

      const id = serializeUniversalId(reimbursement);

      expect(id).to.be.null;
    });
  });

  context('SubscriptionPayment', () => {
    const scenarios = [
      {
        externalProcessor: ExternalTransactionProcessor.BankOfDave,
        expectedPrefix: PaymentMethodType.DAVE_BANKING,
      },
      {
        externalProcessor: ExternalTransactionProcessor.Synapsepay,
        expectedPrefix: PaymentMethodType.BANK_ACCOUNT,
      },
      {
        externalProcessor: ExternalTransactionProcessor.Tabapay,
        expectedPrefix: PaymentMethodType.DEBIT_CARD,
      },
      {
        externalProcessor: ExternalTransactionProcessor.Risepay,
        expectedPrefix: PaymentMethodType.DEBIT_CARD,
      },
    ];

    describe('returns correct universalId for externalProcessor', () => {
      scenarios.forEach(({ externalProcessor, expectedPrefix }) => {
        it(`${externalProcessor}`, async () => {
          const user = await factory.create<User>('user');
          const bankAccount = await factory.create<BankAccount>('bank-account');

          let resourceId = bankAccount.id;
          let paymentMethodId: number;
          if (expectedPrefix === PaymentMethodType.DEBIT_CARD) {
            const debitCard = await factory.create('payment-method');
            paymentMethodId = debitCard.id;
            resourceId = debitCard.id;
          }

          const payment = await factory.create<SubscriptionPayment>('subscription-payment', {
            paymentMethodId,
            bankAccountId: bankAccount.id,
            externalProcessor,
            userId: user.id,
          });

          const id = serializeUniversalId(payment);

          expect(id).to.equal(`${expectedPrefix}:${resourceId}`);
        });
      });
    });

    it('all subscriptionPaymentExternalProcessors tested', () => {
      expect(subscriptionPaymentExternalProcessors.length).to.equal(scenarios.length);
    });

    it('returns null if the processor uses debit and the debit card is missing', async () => {
      const payment = await factory.create<SubscriptionPayment>('subscription-payment', {
        paymentMethodId: null,
        externalProcessor: ExternalTransactionProcessor.Tabapay,
      });

      const id = serializeUniversalId(payment);

      expect(id).to.be.null;
    });

    it('returns null if the processor uses the bank account and it is missing', async () => {
      const user = await factory.create<User>('user');
      const payment = await factory.create<SubscriptionPayment>('subscription-payment', {
        bankAccountId: null,
        userId: user.id,
        externalProcessor: ExternalTransactionProcessor.Synapsepay,
      });

      const id = serializeUniversalId(payment);

      expect(id).to.be.null;
    });

    it('returns null if the externalProcessor field is null', async () => {
      const user = await factory.create<User>('user');

      const [bankAccount, debitCard] = await Promise.all([
        factory.create('bank-account'),
        factory.create('payment-method'),
      ]);

      const payment = await factory.create<SubscriptionPayment>('subscription-payment', {
        externalProcessor: null,
        bankAccountId: bankAccount.id,
        paymentMethodId: debitCard.id,
        userId: user.id,
      });

      const id = serializeUniversalId(payment);

      expect(id).to.be.null;
    });
  });
});
