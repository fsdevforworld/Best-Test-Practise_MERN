import { expect } from 'chai';
import * as sinon from 'sinon';
import factory from '../factories';
import { clean } from '../test-helpers';
import * as Braze from '../../src/lib/braze';
import { moment } from '@dave-inc/time-lib';
import { BankAccount, BankTransaction } from '../../src/models';
import * as NotifyStimulus from '../../src/consumers/covid19-notify-stimulus/notify-stimulus';
import { AnalyticsEvent } from '../../src/typings';
import stubBankTransactionClient from '../test-helpers/stub-bank-transaction-client';

describe('COVID-19 notify stimulus', () => {
  const sandbox = sinon.createSandbox();
  let brazeStub: sinon.SinonStub;

  beforeEach(async () => {
    await clean(sandbox);
    stubBankTransactionClient(sandbox);
    brazeStub = sandbox.stub(Braze, 'track');
  });
  after(() => clean(sandbox));

  async function createBT(
    bankAccount: BankAccount,
    overrides: Partial<BankTransaction> = {},
  ): Promise<BankTransaction> {
    const params = Object.assign(
      {},
      {
        userId: bankAccount.userId,
        bankAccountId: bankAccount.id,
        transactionDate: moment('2020-04-15'),
        amount: 1200,
        displayName: 'irs treas',
      },
      overrides,
    );
    return factory.create('bank-transaction', params);
  }

  describe('get likely transactions from datastore', () => {
    it('should get IRS transactions from DB', async () => {
      const bankAccount = await factory.create('bank-account');
      const t0 = await createBT(bankAccount);
      const t1 = await createBT(bankAccount, { displayName: 'DD:IRS TREAS' });
      const t2 = await createBT(bankAccount, { amount: 2900 });

      const tooEarly = await createBT(bankAccount, { transactionDate: moment('2020-04-10') });
      const lowAmount = await createBT(bankAccount, { amount: 1000 });
      const wrongName = await createBT(bankAccount, { displayName: 'zelle' });

      const results = await NotifyStimulus.getIrsDeposits([bankAccount.id], moment('2020-04-13'));
      const idSet = new Set(results.map(bt => bt.id));

      expect(idSet).contains(t0.id);
      expect(idSet).contains(t1.id);
      expect(idSet).contains(t2.id);
      expect(idSet).not.contains(tooEarly.id);
      expect(idSet).not.contains(lowAmount.id);
      expect(idSet).not.contains(wrongName.id);
    });
  });

  describe('transaction filters', () => {
    it('should check for IRS word boundary', () => {
      expect(NotifyStimulus.irsWordCheck('IRS TREAS')).to.be.true;
      expect(NotifyStimulus.irsWordCheck('ACH/IRS TREAS REF')).to.be.true;
      expect(NotifyStimulus.irsWordCheck('dd:irs treas')).to.be.true;

      expect(NotifyStimulus.irsWordCheck('first national bank')).to.be.false;
      expect(NotifyStimulus.irsWordCheck('irstwhile')).to.be.false;
    });

    it('should check for valid stimulus amount', () => {
      // single + N children
      expect(NotifyStimulus.isValidAmount(1200)).to.be.true;
      expect(NotifyStimulus.isValidAmount(1700)).to.be.true;
      expect(NotifyStimulus.isValidAmount(2200)).to.be.true;
      expect(NotifyStimulus.isValidAmount(2700)).to.be.true;
      expect(NotifyStimulus.isValidAmount(6200)).to.be.true;

      // married + N children
      expect(NotifyStimulus.isValidAmount(2400)).to.be.true;
      expect(NotifyStimulus.isValidAmount(2900)).to.be.true;
      expect(NotifyStimulus.isValidAmount(3400)).to.be.true;
      expect(NotifyStimulus.isValidAmount(3900)).to.be.true;
      expect(NotifyStimulus.isValidAmount(7400)).to.be.true;

      expect(NotifyStimulus.isValidAmount(1000)).to.be.false;
      expect(NotifyStimulus.isValidAmount(1300)).to.be.false;
      expect(NotifyStimulus.isValidAmount(4000)).to.be.false;
    });
  });

  describe('notify stimulus', () => {
    it('should notify Braze for COVID-19 stimulus', async () => {
      const bankAccount = await factory.create('bank-account');
      const t0 = await createBT(bankAccount);

      await NotifyStimulus.notifyStimulus([bankAccount.id]);

      sandbox.assert.calledOnce(brazeStub);
      const [arg] = brazeStub.firstCall.args;
      expect(arg.events[0].externalId).to.equal(bankAccount.userId.toString());
      expect(arg.events[0].name).to.equal(AnalyticsEvent.Covid19Stimulus);
      expect(arg.events[0].properties).to.deep.equal({
        userId: bankAccount.userId,
        transactionDate: t0.transactionDate,
        transactionName: t0.displayName,
        amount: t0.amount,
      });
    });

    it('should not notify Braze for invalid amount', async () => {
      const bankAccount = await factory.create('bank-account');
      await createBT(bankAccount, { amount: 1950 });

      await NotifyStimulus.notifyStimulus([bankAccount.id]);
      sandbox.assert.notCalled(brazeStub);
    });

    it('should not notify Braze for non-IRS name', async () => {
      const bankAccount = await factory.create('bank-account');
      await createBT(bankAccount, { displayName: 'THIRST' });

      await NotifyStimulus.notifyStimulus([bankAccount.id]);
      sandbox.assert.notCalled(brazeStub);
    });
  });
});
