import chaiAsPromised from 'chai-as-promised';
import { expect, use } from 'chai';
import { BankAccountSubtype } from '@dave-inc/wire-typings';
import * as sinon from 'sinon';
import * as Tabapay from '../../../../src/lib/tabapay';
import factory from '../../../factories';
import { clean, fakeDate } from '../../../test-helpers';
import * as RewardsHelper from '../../../../src/domain/rewards';
import * as AddCardToTabapayDomain from '../../../../src/domain/payment-method/add-card-to-tabapay';
import { dogstatsd } from '../../../../src/lib/datadog-statsd';
import {
  InvalidCredentialsError,
  InvalidParametersError,
  NotFoundError,
} from '../../../../src/lib/error';
import { AuditLog, BankAccount, Institution, PaymentMethod, User } from '../../../../src/models';
import {
  ForbiddenMessageKey,
  InvalidParametersMessageKey,
  NotFoundMessageKey,
} from '../../../../src/translations';
import { paymentMethodUpdateEvent } from '../../../../src/domain/event';

import {
  createPaymentMethod,
  updatePaymentMethod,
} from '../../../../src/api/v2/payment-method/controller';

describe('Payment Method Controller', () => {
  const sandbox = sinon.createSandbox();
  let paymentMethodUpdateEventStub: sinon.SinonStub;

  beforeEach(async () => {
    await clean();
    paymentMethodUpdateEventStub = sandbox.stub(paymentMethodUpdateEvent, 'publish').resolves();
  });

  afterEach(() => clean(sandbox));

  describe('createPaymentMethod', () => {
    it('should throw an invalid parameters error if the expiration is invalid', async () => {
      use(() => chaiAsPromised);
      const user = await factory.create<User>('user');
      await expect(
        createPaymentMethod({
          user,
          bankAccountId: 7,
          keyId: null,
          encryptedCardData: null,
          bin: null,
          mask: null,
          expirationMonth: '00',
          expirationYear: '00',
          zipCode: null,
          optedIntoDaveRewards: null,
        }),
      ).to.be.rejectedWith(
        InvalidParametersError,
        InvalidParametersMessageKey.CardThreeMonthValidity,
      );
    });

    it('should throw an invalid parameters error if the expiration is less than two months from now', async () => {
      use(() => chaiAsPromised);
      const now = '2020-01-15';
      fakeDate(sandbox, now);
      const user = await factory.create<User>('user');
      await expect(
        createPaymentMethod({
          user,
          bankAccountId: 7,
          keyId: null,
          encryptedCardData: null,
          bin: null,
          mask: null,
          expirationMonth: '02',
          expirationYear: '2020',
          zipCode: null,
          optedIntoDaveRewards: null,
        }),
      ).to.be.rejectedWith(
        InvalidParametersError,
        InvalidParametersMessageKey.CardThreeMonthValidity,
      );
    });

    it('should throw an invalid parameters error if the bank account is not found', async () => {
      use(() => chaiAsPromised);
      const now = '2020-01-15';
      fakeDate(sandbox, now);
      const user = await factory.create<User>('user');
      await expect(
        createPaymentMethod({
          user,
          bankAccountId: 7,
          keyId: null,
          encryptedCardData: null,
          bin: null,
          mask: null,
          expirationMonth: '05',
          expirationYear: '2020',
          zipCode: null,
          optedIntoDaveRewards: null,
        }),
      ).to.be.rejectedWith(
        InvalidParametersError,
        InvalidParametersMessageKey.MissingBankAccountId,
      );
    });

    it('should throw an invalid parameters error if the bank account belongs to another user', async () => {
      use(() => chaiAsPromised);
      const now = '2020-01-15';
      fakeDate(sandbox, now);
      const user = await factory.create<User>('user');
      const bankAccount = await factory.create<BankAccount>('bank-account');
      await expect(
        createPaymentMethod({
          user,
          bankAccountId: bankAccount.id,
          keyId: null,
          encryptedCardData: null,
          bin: null,
          mask: null,
          expirationMonth: '05',
          expirationYear: '2020',
          zipCode: null,
          optedIntoDaveRewards: null,
        }),
      ).to.be.rejectedWith(
        InvalidParametersError,
        InvalidParametersMessageKey.MissingBankAccountId,
      );
    });

    it('should throw an invalid parameters error if the user has a Chime card but is not a Chime customer', async () => {
      use(() => chaiAsPromised);
      const now = '2020-01-15';
      fakeDate(sandbox, now);
      const user = await factory.create<User>('user');
      const bankAccount = await factory.create<BankAccount>('bank-account', {
        userId: user.id,
      });
      await expect(
        createPaymentMethod({
          user,
          bankAccountId: bankAccount.id,
          keyId: null,
          encryptedCardData: null,
          bin: '423223',
          mask: null,
          expirationMonth: '05',
          expirationYear: '2020',
          zipCode: null,
          optedIntoDaveRewards: null,
        }),
      ).to.be.rejectedWith(InvalidParametersError, InvalidParametersMessageKey.Card23);
    });

    it('should throw an invalid parameters error if the user has a GREEN DOT card but is not a green dot customer', async () => {
      use(() => chaiAsPromised);
      const now = '2020-01-15';
      fakeDate(sandbox, now);
      const user = await factory.create<User>('user');
      const bankAccount = await factory.create<BankAccount>('bank-account', {
        userId: user.id,
      });
      await expect(
        createPaymentMethod({
          user,
          bankAccountId: bankAccount.id,
          keyId: null,
          encryptedCardData: null,
          bin: '437309',
          mask: null,
          expirationMonth: '05',
          expirationYear: '2020',
          zipCode: null,
          optedIntoDaveRewards: null,
        }),
      ).to.be.rejectedWith(InvalidParametersError, InvalidParametersMessageKey.Card24);
    });

    it('should throw an invalid parameters error if zip code is present and invalid', async () => {
      use(() => chaiAsPromised);
      const now = '2020-01-15';
      fakeDate(sandbox, now);
      const user = await factory.create<User>('user');
      const bankAccount = await factory.create<BankAccount>('bank-account', {
        userId: user.id,
      });
      await expect(
        createPaymentMethod({
          user,
          bankAccountId: bankAccount.id,
          keyId: null,
          encryptedCardData: null,
          bin: '1111',
          mask: null,
          expirationMonth: '05',
          expirationYear: '2020',
          zipCode: '00',
          optedIntoDaveRewards: null,
        }),
      ).to.be.rejectedWith(InvalidParametersError, InvalidParametersMessageKey.InvalidZipCodeEntry);
    });

    it('should throw an invalid parameters error if their card type is a mismatch', async () => {
      use(() => chaiAsPromised);
      const now = '2020-01-15';
      fakeDate(sandbox, now);
      sandbox.stub(Tabapay, 'verifyCard').resolves({ type: 'prepaid' });

      const user = await factory.create<User>('user');
      const bankAccount = await factory.create<BankAccount>('bank-account', {
        userId: user.id,
        subtype: BankAccountSubtype.Checking,
      });
      const datadogStub = sandbox.spy(dogstatsd, 'increment');

      await expect(
        createPaymentMethod({
          user,
          bankAccountId: bankAccount.id,
          keyId: null,
          encryptedCardData: null,
          bin: '1111',
          mask: null,
          expirationMonth: '05',
          expirationYear: '2020',
          zipCode: '90019',
          optedIntoDaveRewards: null,
        }),
      ).to.be.rejectedWith(InvalidParametersError, InvalidParametersMessageKey.CardTypeAccountType);

      sinon.assert.calledWithExactly(
        datadogStub,
        'payment_method.create_error.card_type_mismatch',
        {
          bin: '1111',
          institution_id: `${bankAccount.institutionId}`,
          verification_type: 'prepaid',
          match_account_subtype: BankAccountSubtype.Checking,
        },
      );
    });

    it('should create payment method successfully', async () => {
      use(() => chaiAsPromised);
      const now = '2020-01-15';
      const mask = '1234';
      const bin = '1111';
      fakeDate(sandbox, now);
      sandbox.stub(Tabapay, 'verifyCard').resolves({ type: 'prepaid' });
      sandbox.stub(AddCardToTabapayDomain, 'addCardToTabapay').resolves();

      const user = await factory.create<User>('user');
      const bankAccount = await factory.create<BankAccount>('bank-account', {
        userId: user.id,
        subtype: BankAccountSubtype.Prepaid,
      });
      const datadogStub = sandbox.spy(dogstatsd, 'increment');

      const paymentMethod = await createPaymentMethod({
        user,
        bankAccountId: bankAccount.id,
        keyId: 'fakeData',
        encryptedCardData: 'fakeData',
        bin,
        mask,
        expirationMonth: '05',
        expirationYear: '2020',
        zipCode: '90019',
        optedIntoDaveRewards: false,
      });

      const [auditLog] = await Promise.all([
        AuditLog.findOne({ where: { userId: user.id } }),
        bankAccount.reload(),
      ]);

      expect(paymentMethod.userId).to.be.eq(user.id);
      expect(paymentMethod.bankAccountId).to.be.eq(bankAccount.id);
      expect(paymentMethod.mask).to.be.eq(mask);
      expect(paymentMethod.bin).to.be.eq(bin);
      expect(bankAccount.defaultPaymentMethodId).to.be.eq(paymentMethod.id);
      expect(auditLog.userId).to.be.eq(user.id);
      expect(auditLog.type).to.be.eq('PAYMENT_METHOD_CREATE');
      expect(auditLog.eventUuid).to.be.eq(`${paymentMethod.id}`);

      sinon.assert.calledWithExactly(datadogStub, 'payment_method.create_success', {
        bin: '1111',
        institution_id: `${bankAccount.institutionId}`,
        verification_type: 'prepaid',
        match_account_subtype: BankAccountSubtype.Prepaid,
      });
      sinon.assert.calledOnce(paymentMethodUpdateEventStub);
    });

    it('should create payment method successfully despite card type mismatch', async () => {
      use(() => chaiAsPromised);
      const now = '2020-01-15';
      const mask = '1234';
      const bin = '511361';
      fakeDate(sandbox, now);
      sandbox.stub(Tabapay, 'verifyCard').resolves({ type: 'prepaid' });
      sandbox.stub(AddCardToTabapayDomain, 'addCardToTabapay').resolves();

      const user = await factory.create<User>('user');
      const bankAccount = await factory.create<BankAccount>('bank-account', {
        userId: user.id,
        subtype: BankAccountSubtype.Checking,
      });
      const institution = await factory.create<Institution>('institution', { id: 268346 });

      await bankAccount.update({ institutionId: institution.id });
      const datadogStub = sandbox.spy(dogstatsd, 'increment');

      const paymentMethod = await createPaymentMethod({
        user,
        bankAccountId: bankAccount.id,
        keyId: 'fakeData',
        encryptedCardData: 'fakeData',
        bin,
        mask,
        expirationMonth: '05',
        expirationYear: '2020',
        zipCode: '90019',
        optedIntoDaveRewards: false,
      });

      const [auditLog] = await Promise.all([
        AuditLog.findOne({ where: { userId: user.id } }),
        bankAccount.reload(),
      ]);

      expect(paymentMethod.userId).to.be.eq(user.id);
      expect(paymentMethod.bankAccountId).to.be.eq(bankAccount.id);
      expect(paymentMethod.mask).to.be.eq(mask);
      expect(paymentMethod.bin).to.be.eq(bin);
      expect(bankAccount.defaultPaymentMethodId).to.be.eq(paymentMethod.id);
      expect(auditLog.userId).to.be.eq(user.id);
      expect(auditLog.type).to.be.eq('PAYMENT_METHOD_CREATE');
      expect(auditLog.eventUuid).to.be.eq(`${paymentMethod.id}`);

      sinon.assert.calledWithExactly(datadogStub, 'payment_method.create_success', {
        bin,
        institution_id: `${bankAccount.institutionId}`,
        verification_type: 'prepaid',
        match_account_subtype: BankAccountSubtype.Checking,
      });
      sinon.assert.calledOnce(paymentMethodUpdateEventStub);
    });

    it('should create payment method successfully and sever connection with rewards', async () => {
      use(() => chaiAsPromised);
      const now = '2020-01-15';
      const mask = '1234';
      const bin = '1111';
      fakeDate(sandbox, now);
      sandbox.stub(Tabapay, 'verifyCard').resolves({ type: 'prepaid' });
      sandbox.stub(AddCardToTabapayDomain, 'addCardToTabapay').resolves();

      const user = await factory.create<User>('user');
      const empyrPaymentMethod = await factory.create<PaymentMethod>('payment-method', {
        userId: user.id,
        empyrCardId: 1,
      });
      const bankAccount = await factory.create<BankAccount>('bank-account', {
        userId: user.id,
        subtype: BankAccountSubtype.Prepaid,
      });
      const datadogStub = sandbox.spy(dogstatsd, 'increment');
      const deleteEmpyrCardStub = sandbox.stub(RewardsHelper, 'deleteEmpyrCard').resolves();

      const paymentMethod = await createPaymentMethod({
        user,
        bankAccountId: bankAccount.id,
        keyId: 'fakeData',
        encryptedCardData: 'fakeData',
        bin,
        mask,
        expirationMonth: '05',
        expirationYear: '2020',
        zipCode: '90019',
        optedIntoDaveRewards: false,
      });

      const [auditLog] = await Promise.all([
        AuditLog.findOne({ where: { userId: user.id } }),
        bankAccount.reload(),
        empyrPaymentMethod.reload(),
      ]);

      expect(paymentMethod.userId).to.be.eq(user.id);
      expect(paymentMethod.bankAccountId).to.be.eq(bankAccount.id);
      expect(paymentMethod.mask).to.be.eq(mask);
      expect(paymentMethod.bin).to.be.eq(bin);
      expect(bankAccount.defaultPaymentMethodId).to.be.eq(paymentMethod.id);
      expect(auditLog.userId).to.be.eq(user.id);
      expect(auditLog.type).to.be.eq('PAYMENT_METHOD_CREATE');
      expect(auditLog.eventUuid).to.be.eq(`${paymentMethod.id}`);

      sinon.assert.calledWith(deleteEmpyrCardStub, user, empyrPaymentMethod.id);
      sinon.assert.calledWithExactly(datadogStub, 'payment_method.create_success', {
        bin: '1111',
        institution_id: `${bankAccount.institutionId}`,
        verification_type: 'prepaid',
        match_account_subtype: BankAccountSubtype.Prepaid,
      });
      sinon.assert.calledOnce(paymentMethodUpdateEventStub);
    });
  });

  describe('updatePaymentMethod', () => {
    it('should update the payment method successfully', async () => {
      const user = await factory.create<User>('user', { empyrUserId: 1 });
      const paymentMethod = await factory.create<PaymentMethod>('payment-method', {
        userId: user.id,
        empyrCardId: 1,
        optedIntoDaveRewards: true,
      });

      await updatePaymentMethod(user, paymentMethod.id, 2, 2, false);

      await Promise.all([paymentMethod.reload(), user.reload()]);
      expect(paymentMethod.empyrCardId).to.be.eq(2);
      expect(paymentMethod.optedIntoDaveRewards).to.be.false;
      expect(user.empyrUserId).to.be.eq(2);
    });

    it('should throw a not found error if there is no payment method', async () => {
      use(() => chaiAsPromised);
      const user = await factory.create<User>('user');
      await expect(updatePaymentMethod(user, 7, null, null, false)).to.be.rejectedWith(
        NotFoundError,
        NotFoundMessageKey.PaymentMethodPatchNotFound,
      );
    });

    it('should throw a invalid credentials error if user does not own that payment', async () => {
      use(() => chaiAsPromised);
      const user = await factory.create<User>('user');
      const paymentMethod = await factory.create<PaymentMethod>('payment-method');
      await expect(
        updatePaymentMethod(user, paymentMethod.id, null, null, false),
      ).to.be.rejectedWith(
        InvalidCredentialsError,
        ForbiddenMessageKey.PaymentMethodPatchForbidden,
      );
    });

    it('should throw a invalid parameters error if there is no empyrCardId', async () => {
      use(() => chaiAsPromised);
      const user = await factory.create<User>('user');
      const paymentMethod = await factory.create<PaymentMethod>('payment-method', {
        userId: user.id,
      });
      await expect(
        updatePaymentMethod(user, paymentMethod.id, null, null, false),
      ).to.be.rejectedWith(InvalidParametersError, 'Error patching payment method');
    });
  });
});
