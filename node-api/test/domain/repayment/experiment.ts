import 'mocha';
import * as faker from 'faker';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { get } from 'lodash';
import { FindOptions } from 'sequelize';
import {
  shouldRepayWithTivan,
  shouldProcessUserPaymentWithTivan,
} from '../../../src/domain/repayment/experiment';
import { Advance, ABTestingEvent, InternalUser } from '../../../src/models';
import { TIVAN_BA_UPDATE_EVENT } from '../../../src/experiments/tivan-bank-account-update-experiment';
import { TIVAN_AB_TESTING_EVENT } from '../../../src/experiments/tivan-cloud-task-experiment';
import { AdvanceCollectionTrigger } from '../../../src/typings';
import logger from '../../../src/lib/logger';
import factory from '../../factories';

describe('domain/repayment/experiments', () => {
  const sandbox = sinon.createSandbox();

  let findTestEventStub: sinon.SinonStub;

  beforeEach(() => {
    findTestEventStub = sandbox.stub(ABTestingEvent, 'findOne');
  });
  afterEach(() => sandbox.restore());

  it('should check if advance is bucketed to Tivan daily cronjob', async () => {
    findTestEventStub.resolves({} as ABTestingEvent);
    const advanceId = 100;
    const isTivan = await shouldRepayWithTivan(advanceId, AdvanceCollectionTrigger.DAILY_CRONJOB);
    expect(isTivan).to.equal(true);

    sinon.assert.calledOnce(findTestEventStub);
    const { where } = findTestEventStub.firstCall.args[0] as FindOptions;
    expect(get(where, 'eventName')).to.equal(TIVAN_AB_TESTING_EVENT);
    expect(get(where, 'eventUuid')).to.equal(advanceId);
  });

  it('should check if advance is bucketed to Tivan bank account update', async () => {
    findTestEventStub.resolves({} as ABTestingEvent);
    const advanceId = 100;
    const isTivan = await shouldRepayWithTivan(
      advanceId,
      AdvanceCollectionTrigger.BANK_ACCOUNT_UPDATE,
    );
    expect(isTivan).to.equal(true);

    sinon.assert.calledOnce(findTestEventStub);
    const { where } = findTestEventStub.firstCall.args[0] as FindOptions;
    expect(get(where, 'eventName')).to.equal(TIVAN_BA_UPDATE_EVENT);
    expect(get(where, 'eventUuid')).to.equal(advanceId);
  });

  describe('user payment', () => {
    beforeEach(() => {
      // this test is very noisy
      sandbox.stub(logger, 'info');
      sandbox.stub(logger, 'warn');
    });

    it('should bucket payments to Tivan at requested rate', async () => {
      const abCreateStub = sandbox.stub(ABTestingEvent, 'create');
      sandbox.stub(InternalUser, 'findByPk').resolves(null);

      const rate = 0.25;
      const numExperiments = 10000;
      let numBucketed = 0;

      for (let i = 0; i < numExperiments; i++) {
        const fakeAdvance = {
          id: faker.random.number(1e8),
          userId: 1000,
        } as Advance;
        const result = await shouldProcessUserPaymentWithTivan(
          fakeAdvance.id,
          fakeAdvance.userId,
          rate,
        );
        if (result) {
          numBucketed++;
        }
      }

      expect(numBucketed).to.be.greaterThan(2300);
      expect(numBucketed).to.be.lessThan(2700);
      sandbox.assert.callCount(abCreateStub, numBucketed);
    });

    it('should rebucket the same advance', async () => {
      const abCreateStub = sandbox.spy(ABTestingEvent, 'create');
      sandbox.stub(InternalUser, 'findByPk').resolves(null);

      const fakeAdvance = {
        id: faker.random.number(1e8),
        userId: 1000,
      } as Advance;

      const result = await shouldProcessUserPaymentWithTivan(
        fakeAdvance.id,
        fakeAdvance.userId,
        1.0,
      );

      findTestEventStub.resolves({});
      const resultAgain = await shouldProcessUserPaymentWithTivan(
        fakeAdvance.id,
        fakeAdvance.userId,
        1.0,
      );

      expect(result).to.be.true;
      expect(resultAgain).to.be.true;
      sandbox.assert.calledOnce(abCreateStub);
    });

    /* this test should be removed once payments ramp up */
    it('should bucket internal users', async () => {
      sandbox.stub(ABTestingEvent, 'create');
      const internalUser = await factory.create<InternalUser>('internal-user');

      const fakeAdvance = {
        id: faker.random.number(1e8),
        userId: internalUser.id,
      } as Advance;
      const result = await shouldProcessUserPaymentWithTivan(fakeAdvance.id, fakeAdvance.userId, 0);
      expect(result).to.be.true;
    });
  });
});
