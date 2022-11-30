import * as config from 'config';
import * as Faker from 'faker';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { Readable } from 'stream';
import * as Bluebird from 'bluebird';
import { Moment, moment, PACIFIC_TIMEZONE } from '@dave-inc/time-lib';
import factory from '../factories';
import { clean } from '../test-helpers';
import {
  Advance,
  AdvanceTip,
  BankAccount,
  InternalUser,
  RecurringTransaction,
  User,
} from '../../src/models';
import * as Repayment from '../../src/domain/repayment';
import {
  AdvanceCollectionTrigger,
  AnalyticsEvent,
  RecurringTransactionStatus,
} from '../../src/typings';
import {
  attachAsyncDataListener,
  getPaycheckOnDate,
  scheduleCollectionOnPayDay,
} from '../../src/crons/ach-return-repayment';
import Braze from '../../src/lib/braze';
import { RecurringTransactionInterval } from '@dave-inc/wire-typings';

describe('crons/ach-return-repayment', () => {
  const sandbox = sinon.createSandbox();
  let user: User;
  let bankAccount: BankAccount;

  before(() => clean());

  after(() => clean(sandbox));

  beforeEach(async () => {
    user = await factory.create<User>('user', {
      email: `${Faker.random.word}-${Faker.random.number(1e7)}@dave.com`,
    });
    bankAccount = await factory.create<BankAccount>('checking-account', { userId: user.id });
  });

  async function createIncome(
    ba: BankAccount,
    rtParams: Partial<RecurringTransaction>,
  ): Promise<void> {
    const rt = await factory.create<RecurringTransaction>('recurring-transaction', {
      bankAccountId: ba.id,
      userId: ba.userId,
      userAmount: 500,
      status: RecurringTransactionStatus.VALID,
      ...rtParams,
    });

    await ba.update({ mainPaycheckRecurringTransactionId: rt.id });
  }

  describe('getNextPaycheck', () => {
    it('should find next paycheck', async () => {
      await createIncome(bankAccount, {
        interval: RecurringTransactionInterval.MONTHLY,
        params: [5],
      });
      const paycheck = await getPaycheckOnDate('2021-01-05', bankAccount.id);
      expect(paycheck).to.exist;
      expect(paycheck?.expectedDate?.ymd()).to.equal('2021-01-05');
    });

    it('should not find next paycheck if no income', async () => {
      const paycheck = await getPaycheckOnDate('2021-01-05', bankAccount.id);
      expect(paycheck).to.not.exist;
    });

    it('should not find next paycheck if no valid income', async () => {
      await createIncome(bankAccount, {
        interval: RecurringTransactionInterval.MONTHLY,
        params: [5],
        status: RecurringTransactionStatus.INVALID_NAME,
      });
      const paycheck = await getPaycheckOnDate('2021-01-05', bankAccount.id);
      expect(paycheck).to.not.exist;
    });

    it('should not find next paycheck if wrong day', async () => {
      await createIncome(bankAccount, {
        interval: RecurringTransactionInterval.MONTHLY,
        params: [5],
      });
      const paycheck = await getPaycheckOnDate('2021-01-04', bankAccount.id);
      expect(paycheck).to.not.exist;
    });
  });

  describe('scheduleCollectionOnpayDay', () => {
    let brazeStub: sinon.SinonStub;
    let repaymentStub: sinon.SinonStub;
    let advance: Advance;
    let internalUser: InternalUser;

    before(async () => {
      internalUser = await factory.create<InternalUser>('internal-user', {
        id: config.get<number>('scripts.achReturnRepayment.internalUser'),
      });
    });

    beforeEach(async () => {
      sandbox.stub(process, 'env').value({ ...process.env, DAVE_USER_ID: `${internalUser.id}` });
      brazeStub = sandbox.stub(Braze, 'track').resolves();
      repaymentStub = sandbox.stub(Repayment, 'createAdvanceRepaymentTask').resolves();
      advance = await factory.create<Advance>('advance', {
        userId: user.id,
        bankAccountId: bankAccount.id,
        amount: 75,
        outstanding: 0,
      });

      await factory.create<AdvanceTip>('advance-tip', { advanceId: advance.id, amount: 0 });
    });

    afterEach(() => sandbox.restore());

    it('should schedule payment', async () => {
      await createIncome(bankAccount, {
        interval: RecurringTransactionInterval.MONTHLY,
        params: [25],
      });
      const scheduled = await scheduleCollectionOnPayDay('2021-03-25', advance.id);

      expect(scheduled).to.be.true;
      sinon.assert.calledOnce(repaymentStub);
      sinon.assert.calledWith(
        repaymentStub,
        sinon.match((adv: Advance) => adv.id === advance.id),
        AdvanceCollectionTrigger.PAYDAY_CATCHUP,
        sinon.match((options: { startTime: Moment }) => {
          return moment('2021-03-25T06:00:00')
            .tz(PACIFIC_TIMEZONE, true)
            .isSame(options.startTime, 'minute');
        }),
      );

      await advance.reload();
      expect(advance.outstanding).to.equal(advance.amount);
    });

    it('should send braze notification', async () => {
      await createIncome(bankAccount, {
        interval: RecurringTransactionInterval.MONTHLY,
        params: [25],
      });
      const scheduled = await scheduleCollectionOnPayDay('2021-03-25', advance.id);

      expect(scheduled).to.be.true;
      sinon.assert.calledOnce(brazeStub);
      const [args] = brazeStub.firstCall.args;
      expect(args.events?.length).to.equal(1);
      const event = args.events[0];
      expect(event?.name).to.equal(AnalyticsEvent.AchReturnRepaymentScheduled);
      expect(event?.externalId).to.equal(`${user.id}`);
      expect(event?.properties?.email).to.equal(user.email);
    });

    it('should schedule payment with a returned payment', async () => {
      await createIncome(bankAccount, {
        interval: RecurringTransactionInterval.MONTHLY,
        params: [25],
      });
      const scheduled = await scheduleCollectionOnPayDay('2021-03-25', advance.id);
      await factory.create('payment', {
        advanceId: advance.id,
        status: 'RETURNED',
        amount: 75,
      });

      expect(scheduled).to.be.true;
      sinon.assert.calledOnce(repaymentStub);
      sinon.assert.calledWith(
        repaymentStub,
        sinon.match((adv: Advance) => adv.id === advance.id),
        AdvanceCollectionTrigger.PAYDAY_CATCHUP,
        sinon.match((options: { startTime: Moment }) => {
          return moment('2021-03-25T06:00:00')
            .tz(PACIFIC_TIMEZONE, true)
            .isSame(options.startTime, 'minute');
        }),
      );

      await advance.reload();
      expect(advance.outstanding).to.equal(advance.amount);
    });

    it('should not schedule payment if already paid', async () => {
      await createIncome(bankAccount, {
        interval: RecurringTransactionInterval.MONTHLY,
        params: [25],
      });
      const scheduled = await scheduleCollectionOnPayDay('2021-03-25', advance.id);
      await factory.create('payment', {
        advanceId: advance.id,
        status: 'RETURNED',
        amount: 75,
      });
      await factory.create('payment', {
        advanceId: advance.id,
        status: 'COMPLETED',
        amount: 75,
      });

      expect(scheduled).to.be.true;
      sinon.assert.calledOnce(repaymentStub);
      sinon.assert.calledWith(
        repaymentStub,
        sinon.match((adv: Advance) => adv.id === advance.id),
        AdvanceCollectionTrigger.PAYDAY_CATCHUP,
        sinon.match((options: { startTime: Moment }) => {
          return moment('2021-03-25T06:00:00')
            .tz(PACIFIC_TIMEZONE, true)
            .isSame(options.startTime, 'minute');
        }),
      );
    });
  });

  describe('async data listener', () => {
    it('should handle rows with promises', async () => {
      // this mock Readable does not exhibit the behaviors that
      // cause a stream pause/resume to not work, but it at least
      // let's us validate the async wrapper does not break the
      // functionality of the stream
      const stream = Readable.from([0, 1, 2, 3, 4]);

      let processed = 0;

      await new Promise(async resolve => {
        attachAsyncDataListener(stream, async () => {
          await Bluebird.delay(500);
          processed += 1;
        }).on('end', resolve);
      });

      expect(processed).to.equal(5);
    });
  });
});
