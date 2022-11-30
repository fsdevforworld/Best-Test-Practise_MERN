import * as Bluebird from 'bluebird';
import * as sinon from 'sinon';
import { expect } from 'chai';
import { moment } from '@dave-inc/time-lib';
import { Advance, Alert } from '../../src/models';
import twilio from '../../src/lib/twilio';
import { messages, reconnect } from '../../src/crons/reconnect';
import {
  advanceFixture,
  alertFixture,
  bankAccountFixture,
  bankConnectionFixture,
  institutionFixture,
  paymentMethodFixture,
  userFixture,
} from '../fixtures';
import { clean, stubBankTransactionClient } from '../test-helpers';
import { insertFixtureBankTransactions } from '../test-helpers/bank-transaction-fixtures';

describe('Reconnect', () => {
  const fixtures = [
    userFixture,
    institutionFixture,
    bankConnectionFixture,
    bankAccountFixture,
    paymentMethodFixture,
    advanceFixture,
    alertFixture,
  ];

  const sandbox = sinon.createSandbox();
  let twilioStub: sinon.SinonStub;

  beforeEach(async () => {
    await clean(sandbox);
    twilioStub = sandbox.stub(twilio, 'send').resolves();
    stubBankTransactionClient(sandbox);
    insertFixtureBankTransactions();
    return Bluebird.mapSeries(fixtures, fixture => fixture.up());
  });

  after(() => clean(sandbox));

  describe('day before payback', () => {
    beforeEach(() => {
      return Advance.update(
        {
          paybackDate: moment()
            .add(1, 'day')
            .format('YYYY-MM-DD'),
        },
        { where: { id: 15 } },
      );
    });

    it('sends an SMS message to the user', async () => {
      await reconnect();

      sinon.assert.calledWith(twilioStub, messages.DONT_GO_NEGATIVE(), '+11000000005');
    });

    it('logs the DONT_GO_NEGATIVE alert', async () => {
      await reconnect();

      const alert = await Alert.findOne({
        where: {
          eventUuid: '15',
          eventType: 'advance',
        },
      });

      expect(alert.subtype).to.equal('DONT_GO_NEGATIVE');
    });
  });

  describe('two days before payback', () => {
    beforeEach(() => {
      return Advance.update(
        {
          paybackDate: moment()
            .add(2, 'day')
            .format('YYYY-MM-DD'),
        },
        { where: { id: 15 } },
      );
    });

    it('sends an SMS message to the user', async () => {
      await reconnect();

      sinon.assert.calledWith(
        twilioStub,
        messages.ENSURE_SAFE_BALANCE({
          id: 1,
          phoneNumber: '1',
          advanceId: 1,
          paybackDate: moment()
            .add(2, 'day')
            .format('YYYY-MM-DD'),
        }),
        '+11000000005',
      );
    });

    it('logs the ENSURE_SAFE_BALANCE alert', async () => {
      await reconnect();

      const alert = await Alert.findOne({
        where: {
          eventUuid: '15',
          eventType: 'advance',
        },
      });

      expect(alert.subtype).to.equal('ENSURE_SAFE_BALANCE');
    });
  });

  describe('five days before payback', () => {
    beforeEach(() => {
      return Advance.update(
        {
          paybackDate: moment()
            .add(5, 'day')
            .format('YYYY-MM-DD'),
        },
        { where: { id: 15 } },
      );
    });

    it('sends an SMS message to the user', async () => {
      await reconnect();

      sinon.assert.calledWith(twilioStub, messages.KEEP_DAVE_STRONG(), '+11000000005');
    });

    it('logs the KEEP_DAVE_STRONG alert', async () => {
      await reconnect();

      const alert = await Alert.findOne({
        where: {
          eventUuid: '15',
          eventType: 'advance',
        },
      });

      expect(alert.subtype).to.equal('KEEP_DAVE_STRONG');
    });
  });
});
