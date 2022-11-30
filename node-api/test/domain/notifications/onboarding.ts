import * as sinon from 'sinon';
import { expect } from 'chai';

import * as NotificationDomain from '../../../src/domain/notifications';
import * as analytics from '../../../src/services/analytics/client';

import { clean } from '../../test-helpers';

describe('Onboarding Notifications', () => {
  const sandbox = sinon.createSandbox();
  before(() => clean());
  afterEach(() => clean(sandbox));

  it('sends analytics event', async () => {
    const analyticsStub = sandbox.stub(analytics, 'track').resolves();
    await NotificationDomain.sendMultipleAccounts(1);
    expect(analyticsStub).to.be.calledWith({
      userId: '1',
      event: 'shared accounts unsupported',
    });
  });
});
