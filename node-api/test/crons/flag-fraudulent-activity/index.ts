import { expect } from 'chai';
import * as config from 'config';
import * as sinon from 'sinon';
import { run } from '../../../src/crons/flag-fraudulent-activity/index';
import OneTimePayment from '../../../src/crons/flag-fraudulent-activity/one-time-payments';
import FraudHelper from '../../../src/crons/flag-fraudulent-activity/common';
import { FraudAlertReason } from '../../../src/typings';
import { clean } from '../../test-helpers';

describe('flag fradulent activity cron job', () => {
  const sandbox = sinon.createSandbox();

  beforeEach(() => clean(sandbox));
  after(() => clean(sandbox));

  it('should check one time payment counts', async () => {
    const paymentCountSpy = sandbox.spy(OneTimePayment, 'queryOneTimePaymentCount');
    const flagSpy = sandbox.spy(FraudHelper, 'flagEventCountViolations');
    await run();

    sandbox.assert.calledOnce(paymentCountSpy);
    const paymentCounts = config.get('fraud.heuristics.oneTimePayment.maxPayments');
    const timeWindow = config.get('fraud.heuristics.oneTimePayment.timeWindowDays');
    const [paymentCountsArg, timeWindowArg] = paymentCountSpy.firstCall.args;

    expect(paymentCountsArg).to.equal(paymentCounts);
    expect(timeWindowArg).to.equal(timeWindow);

    sandbox.assert.calledWith(
      flagSpy,
      sinon.match.defined,
      FraudAlertReason.TooManyOneTimePayments,
    );
  });

  it('should check one time payment attempts', async () => {
    const paymentAttemptSpy = sandbox.spy(OneTimePayment, 'queryOneTimePaymentAttemptCount');
    const flagSpy = sandbox.spy(FraudHelper, 'flagEventCountViolations');
    await run();

    sandbox.assert.calledOnce(paymentAttemptSpy);
    const paymentAttempts = config.get('fraud.heuristics.oneTimePaymentAttempts.maxAttempts');
    const timeWindow = config.get('fraud.heuristics.oneTimePaymentAttempts.timeWindowDays');
    const [paymentAttemptsArg, timeWindowArg] = paymentAttemptSpy.firstCall.args;

    expect(paymentAttemptsArg).to.equal(paymentAttempts);
    expect(timeWindowArg).to.equal(timeWindow);

    sandbox.assert.calledWith(
      flagSpy,
      sinon.match.defined,
      FraudAlertReason.TooManyOneTimePaymentAttempts,
    );
  });
});
