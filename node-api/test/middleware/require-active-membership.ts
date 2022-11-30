import * as sinon from 'sinon';
import { expect } from 'chai';
import { factory } from 'factory-girl';
import { clean } from '../test-helpers';
import { User } from '../../src/models';
import { requireActiveMembership } from '../../src/middleware';
import { ForbiddenError } from '../../src/lib/error';

describe('Require Active Membership Middleware', () => {
  let spy: any;

  before(() => clean());

  beforeEach(() => {
    spy = sinon.spy();
  });

  afterEach(() => clean());

  it('should throw a ForbiddenError if the user is paused', async () => {
    const user: User = await factory.create('user');
    await factory.create('membership-pause', { userId: user.id });
    const middlewareFn = requireActiveMembership;
    await middlewareFn({ user } as any, null, spy);

    expect(spy).to.have.callCount(1);
    expect(spy.firstCall.args[0]).to.be.an.instanceOf(ForbiddenError);
    expect(spy.firstCall.args[0].message).to.match(
      /Your Dave membership is currently paused. Please update your app and unpause your membership to access this feature\./,
    );
  });

  it('should not throw a error if the user is active', async () => {
    const user: User = await factory.create('user');
    const middlewareFn = requireActiveMembership;
    await middlewareFn({ user } as any, null, spy);

    expect(spy).to.have.callCount(1);
    expect(spy.firstCall.args[0]).to.equal(undefined);
  });
});
