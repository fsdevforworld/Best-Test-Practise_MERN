import { HustlePartner } from '@dave-inc/wire-typings';
import * as request from 'supertest';
import factory from '../../factories';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { clean } from '../../test-helpers';
import amplitude from '../../../src/lib/amplitude';
import { SideHustleProvider } from '../../../src/models';

import app from '../../../src/api';
import braze from '../../../src/lib/braze';

describe('GET side hustle redirect link', () => {
  const sandbox = sinon.createSandbox();

  let user: any;
  let job: any;
  let application: any;
  let amplitudeStub: any;
  let brazeStub: any;

  before(() => clean(sandbox));

  beforeEach(async () => {
    amplitudeStub = sandbox.stub(amplitude, 'track').resolves();
    brazeStub = sandbox.stub(braze, 'track').resolves();
    const [daveProvider] = await Promise.all([
      factory.create<SideHustleProvider>('side-hustle-provider', {
        name: HustlePartner.Dave,
        isDaveAuthority: true,
      }),
    ]);

    user = await factory.create('user');
    job = await factory.create('side-hustle-job');
    application = await factory.create('side-hustle-application', {
      sideHustleJobId: job.id,
      userId: user.id,
      status: 'REQUESTED',
      sideHustleProviderId: daveProvider.id,
    });
  });

  afterEach(() => clean(sandbox));

  it('should take no actions when receiving HEAD requests', async () => {
    await request(app).head(`/r?t=sh&aid=${application.id}&s=email`);

    expect(application.status).to.equal('REQUESTED');
    expect(brazeStub).to.not.have.been.called;
    expect(amplitudeStub).to.not.have.been.called;
  });

  it('should change the status of a side hustle application to CLICKED for an email click', async () => {
    expect(application.status).to.equal('REQUESTED');

    const result = await request(app).get(`/r?t=sh&aid=${application.id}&s=email`);
    await application.reload();

    expect(result.status).to.equal(302);
    expect(application.status).to.equal('CLICKED');
  });

  it('should change the status of a side hustle application to CLICKED for an sms click', async () => {
    expect(application.status).to.equal('REQUESTED');

    const result = await request(app).get(`/r?t=sh&aid=${application.id}&s=sms`);
    await application.reload();

    expect(result.status).to.equal(302);
    expect(application.status).to.equal('CLICKED');
  });

  it('should record amplitude event for an email click', async () => {
    await request(app).get(`/r?t=sh&aid=${application.id}&s=email`);

    expect(amplitudeStub).to.have.callCount(1);
    expect(amplitudeStub).to.have.been.calledWith({
      userId: user.id,
      eventType: 'side hustle notification clicked',
      eventProperties: {
        job: job.company,
        source: 'email',
      },
    });
  });

  it('should record amplitude event for an sms click', async () => {
    await request(app).get(`/r?t=sh&aid=${application.id}&s=sms`);

    expect(amplitudeStub).to.have.callCount(1);
    expect(amplitudeStub).to.have.been.calledWith({
      userId: user.id,
      eventType: 'side hustle notification clicked',
      eventProperties: {
        job: job.company,
        source: 'sms',
      },
    });
  });
});
