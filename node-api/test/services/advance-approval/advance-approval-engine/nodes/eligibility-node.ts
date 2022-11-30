import * as sinon from 'sinon';
import {
  getDefaultApprovalResult,
  MINIMUM_APPROVAL_PAYCHECK_AMOUNT,
  serializeApprovalResponse,
} from '../../../../../src/services/advance-approval/advance-approval-engine';
import EligibilityNode from '../../../../../src/services/advance-approval/advance-approval-engine/nodes/eligibility-node';
import AccountAgeNode from '../../../../../src/services/advance-approval/advance-approval-engine/nodes/account-age-node';
import * as UserSetting from '../../../../../src/domain/user-setting/timezone';
import { expect } from 'chai';
import 'mocha';
import { DEFAULT_TIMEZONE, moment } from '@dave-inc/time-lib';
import { RecurringTransactionStatus } from '../../../../../src/typings';
import { AdvanceApprovalResult } from '../../../../../src/services/advance-approval/types';
import {
  AdminPaycheckOverride,
  Advance,
  BankAccount,
  BankConnection,
  Payment,
  RecurringTransaction,
  User,
} from '../../../../../src/models';
import { clean, stubBankTransactionClient, stubLoomisClient, up } from '../../../../test-helpers';
import factory from '../../../../factories';
import { ExternalTransactionProcessor } from '@dave-inc/wire-typings';
import { getApprovalBankAccount } from '../../../../../src/domain/advance-approval-request';
import RecurringTransactionClient from '../../../../../src/services/advance-approval/recurring-transaction-client';

describe('EligibilityNode', () => {
  const sandbox = sinon.createSandbox();

  let engine: EligibilityNode;
  let bankAccount: BankAccount;
  let approvalDict: any;
  let approvalResponse: AdvanceApprovalResult;

  before(() => clean());
  beforeEach(async () => {
    stubBankTransactionClient(sandbox);
    stubLoomisClient(sandbox);
    await up();
    const bankAccountId = 1;
    bankAccount = await BankAccount.findByPk(bankAccountId);
    const [user, bankConnection] = await Promise.all([
      User.findByPk(bankAccount.userId),
      BankConnection.findByPk(bankAccount.bankConnectionId),
    ]);
    approvalDict = {
      advances: [],
      userId: user.id,
      bankAccount: await getApprovalBankAccount(bankAccount),
      advanceSummary: { totalAdvancesTaken: 0, outstandingAdvance: null },
      bankConnection,
      userTimezone: DEFAULT_TIMEZONE,
      isAdmin: false,
      paycheck: null,
      accountAgeDays: 60,
    };

    approvalResponse = getDefaultApprovalResult(approvalDict, {});
    engine = new EligibilityNode();
    engine.onSuccess(new AccountAgeNode());
  });

  afterEach(() => clean(sandbox));

  it('should fail if bank connection credentials are invalid', async () => {
    approvalDict.bankAccount.hasValidCredentials = false;
    const events = serializeApprovalResponse(
      await engine.evaluate(approvalDict, approvalResponse),
      approvalDict,
    );
    expect(events.primaryRejectionReason).to.be.an('object');
    expect(events.primaryRejectionReason.type).to.equal('bank-disconnected');
  });

  it('should fail if there are outstanding advances', async () => {
    approvalDict.advanceSummary = { totalAdvancesTaken: 1, outstandingAdvance: {} };
    approvalDict.payments = [];
    const events = serializeApprovalResponse(
      await engine.evaluate(approvalDict, approvalResponse),
      approvalDict,
    );
    expect(events.primaryRejectionReason).to.be.an('object');
    expect(events.primaryRejectionReason.type).to.equal('one-advance');
  });

  it('should pass if payment was debit made yesterday', async () => {
    const created = moment().subtract(1, 'days');
    const externalProcessor = ExternalTransactionProcessor.Tabapay;
    const advance = Advance.build({ amount: 25, created, outstanding: 0 });
    approvalDict.advances = [advance];
    sandbox.stub(Advance, 'findOne').resolves(advance);
    sandbox
      .stub(Payment, 'findOne')
      .onFirstCall()
      .resolves(
        Payment.build({
          created,
          externalProcessor,
          status: 'COMPLETED',
        }),
      )
      .onSecondCall()
      .resolves(null);
    const events = serializeApprovalResponse(
      await engine.evaluate(approvalDict, approvalResponse),
      approvalDict,
    );
    expect(events.primaryRejectionReason).to.be.undefined;
  });

  it('should pass if tiny money advance was created yesterday', async () => {
    const created = moment().subtract(1, 'day');
    const advance = Advance.build({ amount: 24.99, created, outstanding: 0 });
    approvalDict.advances = [advance];
    sandbox.stub(Advance, 'findOne').resolves(advance);
    const events = serializeApprovalResponse(
      await engine.evaluate(approvalDict, approvalResponse),
      approvalDict,
    );
    expect(events.primaryRejectionReason).to.be.undefined;
  });

  it('should fail if tiny money advance was created today', async () => {
    const created = moment().startOf('second');
    const externalProcessor = ExternalTransactionProcessor.Tabapay;
    const advance = Advance.build({ amount: 24.99, created, outstanding: 0 });
    const timezone = 'America/New_York';
    approvalDict.userTimezone = timezone;
    approvalDict.advances = [advance];
    sandbox.stub(Advance, 'findOne').resolves(advance);
    sandbox.stub(Payment, 'findOne').resolves(Payment.build({ created, externalProcessor }));
    sandbox.stub(UserSetting, 'getTimezone').resolves(timezone);
    const events = serializeApprovalResponse(
      await engine.evaluate(approvalDict, approvalResponse),
      approvalDict,
    );

    expect(events.rejectionReasons[0]).to.be.an('object');
    expect(events.rejectionReasons[0].type).to.equal('has-recent-payment');
    const coolOffDate = created.clone().add(1, 'day');
    expect(events.rejectionReasons[0].extra.coolOffDate).to.be.sameMoment(coolOffDate);
    coolOffDate
      .tz(timezone)
      .add(1, 'hour')
      .startOf('hour');
    const template = `Your payment is pending. Check back on ${coolOffDate.format(
      'ddd, MMM DD',
    )} at ${coolOffDate.format('h:ss A')} to try and get another advance.`;
    expect(events.rejectionReasons[0].message).to.equal(template);
  });

  it('should fail if payment was debit made today', async () => {
    const created = moment().startOf('second');
    const externalProcessor = ExternalTransactionProcessor.Tabapay;
    const advance = Advance.build({ amount: 25, created, outstanding: 0 });
    const timezone = 'America/Chicago';
    approvalDict.userTimezone = timezone;
    approvalDict.advances = [advance];
    sandbox.stub(Advance, 'findOne').resolves(advance);
    sandbox.stub(Payment, 'findOne').resolves(Payment.build({ created, externalProcessor }));
    sandbox.stub(UserSetting, 'getTimezone').resolves(timezone);
    const events = serializeApprovalResponse(
      await engine.evaluate(approvalDict, approvalResponse),
      approvalDict,
    );

    expect(events.rejectionReasons[0]).to.be.an('object');
    expect(events.rejectionReasons[0].type).to.equal('has-recent-payment');
    const coolOffDate = created.clone().add(1, 'day');
    expect(events.rejectionReasons[0].extra.coolOffDate).to.be.sameMoment(coolOffDate);
    coolOffDate
      .tz(timezone)
      .add(1, 'hour')
      .startOf('hour');
    const template = `Your payment is pending. Check back on ${coolOffDate.format(
      'ddd, MMM DD',
    )} at ${coolOffDate.format('h:ss A')} to try and get another advance.`;
    expect(events.rejectionReasons[0].message).to.equal(template);
  });

  it('should fail if payment was ACH and made today', async () => {
    const created = moment().startOf('second');
    const externalProcessor = ExternalTransactionProcessor.Synapsepay;
    const advance = Advance.build({ amount: 25, created, outstanding: 0 });
    approvalDict.advances = [advance];
    const timezone = 'Etc/GMT+5';
    approvalDict.userTimezone = timezone;
    sandbox.stub(Advance, 'findOne').resolves(advance);
    sandbox
      .stub(Payment, 'findOne')
      .onFirstCall()
      .resolves(Payment.build({ created, externalProcessor }))
      .onSecondCall()
      .resolves(null);
    sandbox.stub(UserSetting, 'getTimezone').resolves(timezone);

    const events = serializeApprovalResponse(
      await engine.evaluate(approvalDict, approvalResponse),
      approvalDict,
    );
    expect(events.rejectionReasons[0]).to.be.an('object');
    expect(events.rejectionReasons[0].type).to.equal('has-recent-payment');
    const coolOffDate = created.clone().add(3, 'day');
    expect(events.rejectionReasons[0].extra.coolOffDate).to.be.sameMoment(coolOffDate);
    coolOffDate
      .tz(timezone)
      .add(1, 'hour')
      .startOf('hour');
    const template = `Your payment is pending. Check back on ${coolOffDate.format(
      'ddd, MMM DD',
    )} at ${coolOffDate.format('h:ss A')} to try and get another advance.`;
    expect(events.rejectionReasons[0].message).to.equal(template);
  });

  it('should fail if payment was ACH and made yesterday', async () => {
    const created = moment()
      .subtract(1, 'days')
      .startOf('second');
    const externalProcessor = ExternalTransactionProcessor.Synapsepay;
    const advance = Advance.build({ amount: 25, created, outstanding: 0 });
    approvalDict.advances = [advance];
    const timezone = 'US/Eastern';
    approvalDict.userTimezone = timezone;
    sandbox.stub(Advance, 'findOne').resolves(advance);
    sandbox.stub(Payment, 'findOne').resolves(Payment.build({ created, externalProcessor }));
    sandbox.stub(UserSetting, 'getTimezone').resolves(timezone);
    const events = serializeApprovalResponse(
      await engine.evaluate(approvalDict, approvalResponse),
      approvalDict,
    );

    expect(events.rejectionReasons[0]).to.be.an('object');
    expect(events.rejectionReasons[0].type).to.equal('has-recent-payment');
    const coolOffDate = created.clone().add(3, 'day');
    expect(events.rejectionReasons[0].extra.coolOffDate).to.be.sameMoment(coolOffDate);
    coolOffDate
      .tz(timezone)
      .add(1, 'hour')
      .startOf('hour');
    const template = `Your payment is pending. Check back on ${coolOffDate.format(
      'ddd, MMM DD',
    )} at ${coolOffDate.format('h:ss A')} to try and get another advance.`;
    expect(events.rejectionReasons[0].message).to.equal(template);
  });

  it('should fail if payment was ACH and made day before yesterday', async () => {
    const created = moment()
      .subtract(2, 'days')
      .startOf('second');
    const externalProcessor = ExternalTransactionProcessor.Synapsepay;
    const advance = Advance.build({ amount: 25, created, outstanding: 0 });
    const timezone = DEFAULT_TIMEZONE;
    approvalDict.advances = [advance];
    sandbox.stub(Advance, 'findOne').resolves(advance);
    sandbox.stub(Payment, 'findOne').resolves(Payment.build({ created, externalProcessor }));
    sandbox.stub(UserSetting, 'getTimezone').resolves('');
    const events = serializeApprovalResponse(
      await engine.evaluate(approvalDict, approvalResponse),
      approvalDict,
    );
    expect(events.rejectionReasons[0]).to.be.an('object');
    expect(events.rejectionReasons[0].type).to.equal('has-recent-payment');
    const coolOffDate = created.clone().add(3, 'day');
    expect(events.rejectionReasons[0].extra.coolOffDate).to.be.sameMoment(coolOffDate);
    coolOffDate
      .tz(timezone)
      .add(1, 'hour')
      .startOf('hour');
    const template = `Your payment is pending. Check back on ${coolOffDate.format(
      'ddd, MMM DD',
    )} at ${coolOffDate.format('h:ss A')} to try and get another advance.`;
    expect(events.rejectionReasons[0].message).to.equal(template);
  });

  it('should pass if payment was ACH and was made 3 days ago', async () => {
    approvalDict.advances = [{ outstanding: 0 }];
    const created = moment().subtract(3, 'days');
    const externalProcessor = ExternalTransactionProcessor.Synapsepay;
    sandbox
      .stub(Payment, 'findOne')
      .onFirstCall()
      .resolves(Payment.build({ created, externalProcessor }))
      .onSecondCall()
      .resolves(null);
    approvalDict.bankAccount.current = -20;
    const events = serializeApprovalResponse(
      await engine.evaluate(approvalDict, approvalResponse),
      approvalDict,
    );
    expect(events.primaryRejectionReason).to.be.undefined;
  });

  it('should fail if the account balance is too low', async () => {
    approvalDict.advances = [{ outstanding: 0 }];
    approvalDict.bankAccount.current = -100;

    const events = serializeApprovalResponse(
      await engine.evaluate(approvalDict, approvalResponse),
      approvalDict,
    );
    expect(events.primaryRejectionReason).to.be.an('object');
    expect(events.primaryRejectionReason.type).to.equal('balance-too-low');
  });

  it('should fail if the account is too young', async () => {
    approvalDict.accountAgeDays = 50;

    const events = serializeApprovalResponse(
      await engine.evaluate(approvalDict, approvalResponse),
      approvalDict,
    );
    expect(events.primaryRejectionReason).to.be.an('object');
    expect(events.primaryRejectionReason.type).to.equal('account-age');
  });

  it('should fail if the bank_connection.initial_pull is null', async () => {
    approvalDict.bankAccount.initialPull = null;
    const events = serializeApprovalResponse(
      await engine.evaluate(approvalDict, approvalResponse),
      approvalDict,
    );
    expect(events.primaryRejectionReason).to.be.an('object');
    expect(events.primaryRejectionReason.type).to.equal('awaiting-initial-pull');
  });

  it('should fail if the bank account does not have account/routing', async () => {
    await bankAccount.eraseAccountRouting();
    approvalDict.bankAccount = await getApprovalBankAccount(bankAccount);

    const events = serializeApprovalResponse(
      await engine.evaluate(approvalDict, approvalResponse),
      approvalDict,
    );
    expect(events.primaryRejectionReason).to.be.an('object');
    expect(events.primaryRejectionReason.type).to.equal('micro-deposit-incomplete');
  });

  it('should fail if the bank account has not finished micro-deposited', async () => {
    await bankAccount.update({ microDeposit: 'FAILED' });
    approvalDict.bankAccount = await getApprovalBankAccount(bankAccount);

    const events = serializeApprovalResponse(
      await engine.evaluate(approvalDict, approvalResponse),
      approvalDict,
    );
    expect(events.primaryRejectionReason).to.be.an('object');
    expect(events.primaryRejectionReason.type).to.equal('micro-deposit-incomplete');
  });

  it('should fail if the bank account has not been micro-deposited', async () => {
    await bankAccount.update({ microDeposit: 'REQUIRED' });
    approvalDict.bankAccount = await getApprovalBankAccount(bankAccount);

    const events = serializeApprovalResponse(
      await engine.evaluate(approvalDict, approvalResponse),
      approvalDict,
    );
    expect(events.primaryRejectionReason).to.be.an('object');
    expect(events.primaryRejectionReason.type).to.equal('micro-deposit-incomplete');
  });

  it('should fail if a user has pending payments', async () => {
    const advance = await factory.create('advance', {
      bankAccountId: approvalDict.bankAccount.id,
      userId: approvalDict.userId,
    });
    await factory.create('payment', {
      bankAccountId: approvalDict.bankAccount.id,
      userId: approvalDict.userId,
      status: 'PENDING',
      advanceId: advance.id,
      created: moment().subtract(7, 'days'),
    });

    const events = serializeApprovalResponse(
      await engine.evaluate(approvalDict, approvalResponse),
      approvalDict,
    );
    expect(events.primaryRejectionReason).to.be.an('object');
    expect(events.primaryRejectionReason.type).to.equal('has-pending-payment');
  });

  [
    {
      testCase: 'should fail when dave banking user has no income setup',
      incomes: [],
      incomeOverride: false,
      expectedRejection: {
        type: 'dave-banking-no-income',
        message: 'You must have a valid income greater than $200.',
      },
    },
    {
      testCase:
        'should pass when dave banking user has no income setup but there is income override set',
      incomes: [],
      incomeOverride: true,
      expectedRejection: undefined,
    },
    {
      testCase: 'should fail when dave banking user income has not been validated yet',
      incomes: [{ status: RecurringTransactionStatus.NOT_VALIDATED, userAmount: 200 }],
      incomeOverride: false,
      expectedRejection: {
        type: 'dave-banking-no-income',
        message: 'You must have a valid income greater than $200.',
      },
    },
    {
      testCase: 'should fail when dave banking user has less income less than 200',
      incomes: [{ status: RecurringTransactionStatus.VALID, userAmount: 199 }],
      incomeOverride: false,
      expectedRejection: {
        type: 'dave-banking-no-income',
        message: 'You must have a valid income greater than $200.',
      },
    },
    {
      testCase: 'should pass when dave banking user has valid income setup',
      incomeOverride: false,
      incomes: [
        { status: RecurringTransactionStatus.VALID, userAmount: MINIMUM_APPROVAL_PAYCHECK_AMOUNT },
        {
          status: RecurringTransactionStatus.VALID,
          userAmount: MINIMUM_APPROVAL_PAYCHECK_AMOUNT - 1,
        },
      ],
      expectedRejection: undefined,
    },
    {
      testCase: 'should pass when dave banking user has valid single observation income setup',
      incomeOverride: false,
      incomes: [
        {
          status: RecurringTransactionStatus.SINGLE_OBSERVATION,
          userAmount: MINIMUM_APPROVAL_PAYCHECK_AMOUNT,
        },
        { status: RecurringTransactionStatus.NOT_VALIDATED, userAmount: 200 },
      ],
      expectedRejection: undefined,
    },
  ].forEach(({ testCase, incomeOverride, incomes, expectedRejection }) => {
    it(testCase, async () => {
      approvalDict.bankAccount.isDaveBanking = true;

      if (incomeOverride) {
        approvalDict.incomeOverride = await factory.build<AdminPaycheckOverride>(
          'admin-paycheck-override',
          {
            userId: approvalDict.userId,
            bankAccountId: approvalDict.bankAccount.id,
          },
        );
      }

      if (incomes.length) {
        const reccurs = await factory.createMany<RecurringTransaction>(
          'recurring-transaction',
          incomes.map(income => ({
            ...income,
            userId: approvalDict.userId,
            bankAccountId: approvalDict.bankAccount.id,
          })),
        );
        sandbox
          .stub(RecurringTransactionClient, 'getIncomes')
          .resolves(reccurs.filter(r => r.status !== RecurringTransactionStatus.NOT_VALIDATED));
      } else {
        sandbox.stub(RecurringTransactionClient, 'getIncomes').resolves([]);
      }

      const events = serializeApprovalResponse(
        await engine.evaluate(approvalDict, approvalResponse),
        approvalDict,
      );

      expect(events.primaryRejectionReason).to.deep.equal(expectedRejection);
    });
  });
});
