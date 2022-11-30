import * as Loomis from '@dave-inc/loomis-client';
import {
  PaymentGateway,
  PaymentProcessor,
  PaymentProviderTransactionStatus,
  PaymentProviderTransactionType,
} from '@dave-inc/loomis-client';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { replayHttp, TABAPAY_ACCOUNT_ID, clean, stubLoomisClient } from '../../test-helpers';
import factory from '../../factories';
import {
  User,
  PaymentMethod,
  BankAccount,
  Reimbursement,
  AuditLog,
  BankConnection,
  InternalUser,
} from '../../../src/models';
import * as utils from '../../../src/lib/utils';
import { createReimbursement } from '../../../src/domain/reimbursement';
import { helpers } from '../../../src/domain/synapsepay';
import { BankingDataSource } from '@dave-inc/wire-typings';
import { paymentMethodModelToType } from '../../../src/typings';
import { InvalidParametersError } from '../../../src/lib/error';

const fixtureDir = '/domain/reimbursement';
const sandbox = sinon.createSandbox();

describe('createReimbursement', () => {
  before(() => clean());

  beforeEach(() => stubLoomisClient(sandbox));

  afterEach(() => {
    return clean(sandbox);
  });

  let reimburser: InternalUser;
  beforeEach(async () => {
    reimburser = await factory.create<InternalUser>('internal-user');
  });

  context('debit card destination', () => {
    const fixture = `${fixtureDir}/debit-card-success.json`;

    let destination: PaymentMethod;
    let reimbursement: Reimbursement;
    let user: User;
    beforeEach(
      replayHttp(fixture, async () => {
        destination = await factory.create<PaymentMethod>('payment-method', {
          tabapayId: TABAPAY_ACCOUNT_ID,
        });
        user = await User.findByPk(destination.userId);

        sandbox.stub(utils, 'generateRandomHexString').returns('32ed1462f422ba7');

        reimbursement = await createReimbursement({
          user,
          destination: paymentMethodModelToType(destination),
          amount: 0.1,
          reimburser,
          reason: 'Foo bar',
        });
      }),
    );

    it('successfully creates a debit card reimbursement', () => {
      expect(reimbursement).to.include({
        status: 'COMPLETED',
        userId: user.id,
        payableId: destination.id,
        payableType: 'PAYMENT_METHOD',
        externalProcessor: 'TABAPAY',
        reimburserId: reimburser.id,
        amount: 0.1,
      });

      expect(reimbursement.externalId).to.be.a('string');
      expect(reimbursement.referenceId).to.be.a('string');
    });

    it('has an audit log entry', async () => {
      const log = await AuditLog.findOne({
        where: {
          type: 'REIMBURSEMENT_CREATE',
          userId: destination.userId,
        },
      });

      expect(log).to.include({
        successful: true,
        eventUuid: `${reimbursement.id}`,
      });
    });
  });

  context('bank account destination', () => {
    let destination: BankAccount;
    let reimbursement: Reimbursement;
    beforeEach(async () => {
      const referenceId = '32ed1462f422ba71';
      destination = await factory.create<BankAccount>('bank-account', {
        synapseNodeId: '5e3b304ec2e6f385d4104cd0',
      });

      await destination.reload({ include: [User] });

      sandbox.stub(utils, 'generateRandomHexString').returns(referenceId);
      sandbox.stub(helpers, 'getUserIP').returns('192.168.0.124');
      const createTransaction = sandbox.stub().resolves({
        type: PaymentProviderTransactionType.AdvanceDisbursement,
        externalId: 'T4ECOVMVCQGO2aV6k6vYGg',
        referenceId,
        amount: 0.1,
        gateway: PaymentGateway.Synapsepay,
        processor: PaymentProcessor.Synapsepay,
        status: PaymentProviderTransactionStatus.Pending,
      });
      sandbox
        .stub(Loomis, 'getPaymentGateway')
        .withArgs(PaymentGateway.Synapsepay)
        .returns({ createTransaction });

      reimbursement = await createReimbursement({
        user: destination.user,
        destination,
        amount: 0.1,
        reimburser,
        reason: 'Foo bar',
      });
    });

    it('successfully creates a bank account reimbursement', () => {
      expect(reimbursement).to.include({
        status: 'PENDING',
        userId: destination.user.id,
        payableId: destination.id,
        payableType: 'BANK_ACCOUNT',
        externalProcessor: 'SYNAPSEPAY',
        reimburserId: reimburser.id,
        amount: 0.1,
      });

      expect(reimbursement.externalId).to.be.a('string');
      expect(reimbursement.referenceId).to.be.a('string');
    });

    it('has an audit log entry', async () => {
      const log = await AuditLog.findOne({
        where: {
          type: 'REIMBURSEMENT_CREATE',
          userId: destination.userId,
        },
      });

      expect(log).to.include({
        successful: true,
        eventUuid: `${reimbursement.id}`,
      });
    });
  });

  context('Dave Banking account destination', () => {
    let destination: BankAccount;
    let reimbursement: Reimbursement;
    beforeEach(async () => {
      const referenceId = '4c8a69a3d86f3b2';
      const bankConnection = await factory.create<BankConnection>('bank-connection', {
        bankingDataSource: BankingDataSource.BankOfDave,
        externalId: '9660f451-f5b3-4259-8568-7d816c93068e',
        authToken: '9660f451-f5b3-4259-8568-7d816c93068e',
      });

      destination = await factory.create<BankAccount>('bank-account', {
        userId: bankConnection.userId,
        bankConnectionId: bankConnection.id,
        externalId: '02fd800f-9e74-4a9d-8268-7133285fc709',
      });

      await destination.reload({ include: [User] });

      sandbox.stub(utils, 'generateRandomHexString').returns(referenceId);
      const createTransaction = sandbox.stub().resolves({
        type: PaymentProviderTransactionType.AdvanceDisbursement,
        externalId: 'T4ECOVMVCQGO2aV6k6vYGg',
        referenceId,
        amount: 0.1,
        gateway: PaymentGateway.BankOfDave,
        processor: PaymentProcessor.BankOfDave,
        status: PaymentProviderTransactionStatus.Pending,
      });
      sandbox
        .stub(Loomis, 'getPaymentGateway')
        .withArgs(PaymentGateway.BankOfDave)
        .returns({ createTransaction });

      reimbursement = await createReimbursement({
        user: destination.user,
        destination,
        amount: 0.1,
        reimburser,
        reason: 'Foo bar',
      });
    });

    it('successfully creates a bank account reimbursement', () => {
      expect(reimbursement).to.include({
        status: 'PENDING',
        userId: destination.user.id,
        payableId: destination.id,
        payableType: 'BANK_ACCOUNT',
        externalProcessor: 'BANK_OF_DAVE',
        reimburserId: reimburser.id,
        amount: 0.1,
      });

      expect(reimbursement.externalId).to.be.a('string');
      expect(reimbursement.referenceId).to.be.a('string');
    });

    it('has an audit log entry', async () => {
      const log = await AuditLog.findOne({
        where: {
          type: 'REIMBURSEMENT_CREATE',
          userId: destination.userId,
        },
      });

      expect(log).to.include({
        successful: true,
        eventUuid: `${reimbursement.id}`,
      });
    });
  });

  context('no destination', () => {
    it('throws invalid parameters error', async () => {
      const user = await factory.create('user');
      await expect(
        createReimbursement({
          user,
          destination: null,
          amount: 0.01,
          reimburser,
          reason: 'Foo',
        }),
      ).to.be.rejectedWith(InvalidParametersError);
    });
  });

  context('a failed transaction', () => {
    const fixture = `${fixtureDir}/debit-card-failure.json`;

    let destination: PaymentMethod;
    let reimbursement: Reimbursement;
    let user: User;
    beforeEach(
      replayHttp(fixture, async () => {
        destination = await factory.create<PaymentMethod>('payment-method', {
          tabapayId: TABAPAY_ACCOUNT_ID,
        });
        user = await User.findByPk(destination.userId);
        sandbox.stub(utils, 'generateRandomHexString').returns('2873cd663630c80');

        reimbursement = await createReimbursement({
          user,
          destination: paymentMethodModelToType(destination),
          amount: 0.01,
          reimburser,
          reason: 'Foo bar',
        });
      }),
    );

    it('updates the reimbursement with transaction details', () => {
      expect(reimbursement.status).to.equal('FAILED', 'sets the status to FAILED');

      expect(reimbursement).to.include({
        userId: user.id,
        payableId: destination.id,
        payableType: 'PAYMENT_METHOD',
        externalProcessor: 'TABAPAY',
        reimburserId: reimburser.id,
        amount: 0.01,
      });
      expect(reimbursement.externalId).to.be.a('string');
      expect(reimbursement.referenceId).to.be.a('string');
    });

    it('has an audit log entry', async () => {
      const log = await AuditLog.findOne({
        where: {
          type: 'REIMBURSEMENT_CREATE',
          userId: destination.userId,
        },
      });

      expect(log).to.include({
        successful: false,
        eventUuid: `${reimbursement.id}`,
      });
    });
  });
});
