import { expect } from 'chai';
import * as sinon from 'sinon';
import FraudHelper from '../../../src/crons/flag-fraudulent-activity/common';
import { FraudAlert } from '../../../src/models';
import { FraudAlertReason } from '../../../src/typings';
import factory from '../../factories';
import { clean } from '../../test-helpers';

describe('flag-fraudulent-activity/common', () => {
  const sandbox = sinon.createSandbox();
  beforeEach(() => clean(sandbox));
  after(() => clean(sandbox));

  it('should create fraud alerts from event count violations and given reason', async () => {
    const user0 = await factory.create('user');
    const user1 = await factory.create('user');
    const userEventCounts = Promise.resolve([
      {
        userId: user0.id,
        eventCount: 100,
      },
      {
        userId: user1.id,
        eventCount: 120,
      },
    ]);

    expect(user0.fraud).to.not.be.true;
    expect(user1.fraud).to.not.be.true;

    await FraudHelper.flagEventCountViolations(
      userEventCounts,
      FraudAlertReason.TooManyOneTimePayments,
    );
    await user0.reload();
    await user1.reload();

    expect(user0.fraud).to.be.true;
    expect(user1.fraud).to.be.true;

    const alerts = await FraudAlert.findAll({
      where: { reason: FraudAlertReason.TooManyOneTimePayments },
    });
    expect(alerts.length).to.equal(2);
    const alertUsers = alerts.map(alert => alert.userId);
    expect(alertUsers).contains(user0.id);
    expect(alertUsers).contains(user1.id);
  });
});
