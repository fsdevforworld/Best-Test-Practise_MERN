import * as Bluebird from 'bluebird';
import { expect } from 'chai';
import * as sinon from 'sinon';
import factory from '../../factories';
import { clean } from '../../test-helpers';
import amplitude from '../../../src/lib/amplitude';
import sendgrid from '../../../src/lib/sendgrid';
import twilio from '../../../src/lib/twilio';
import { sideHustleNotifications } from '../../../src/jobs/handlers';
import { SideHustleApplication, SideHustleProvider } from '../../../src/models';
import { Status } from '../../../src/models/side-hustle-application';
import { HustlePartner } from '@dave-inc/wire-typings';

describe('Job: side-hustle-notifications', () => {
  const sandbox = sinon.createSandbox();
  let amplitudeStub: any;
  const jobs: any = {
    airbnb: {
      id: 1,
      name: 'Airbnb Host',
      company: 'Airbnb',
      externalId: 'airbnb',
    },
    instacart: {
      id: 2,
      name: 'Instacart Shopper',
      company: 'Instacart',
      externalId: 'instacart',
    },
    uberEats: {
      id: 3,
      name: 'Uber Eats Delivery Partner',
      company: 'Uber Eats',
      externalId: 'ubereats',
    },
    uber: {
      id: 4,
      name: 'Uber Driver Partner',
      company: 'Uber',
      externalId: 'uber',
    },
  };

  before(async () => {
    await clean();
    const shp = await factory.create<SideHustleProvider>('side-hustle-provider', {
      name: HustlePartner.Dave,
      isDaveAuthority: true,
    });

    const jobKeys = Object.keys(jobs);
    const createdJobs = jobKeys.map(name => {
      const job = jobs[name];
      job.sideHustleProviderId = shp.id;
      return factory.create('side-hustle-job', job);
    });
    await Bluebird.all(createdJobs);
  });

  beforeEach(async () => {
    amplitudeStub = sandbox.stub(amplitude, 'track').resolves();
  });

  afterEach(() => sandbox.restore());

  it('should successfully send email and sms notifications', async () => {
    const sendgridStub = sandbox.stub(sendgrid, 'sendDynamic').resolves([
      {
        statusCode: 202,
      },
    ]);
    const twilioStub = sandbox.stub(twilio, 'send').resolves();

    const user = await factory.create('user', { email: 'buggy@bugs.bug' }, { hasSession: true });

    const testJobIds = [jobs.instacart.id, jobs.uber.id];
    const applications = testJobIds.map(sideHustleJobId => {
      return factory.create('side-hustle-application', {
        sideHustleJobId,
        userId: user.id,
        status: Status.REQUESTED,
      });
    });

    const applicationIds = await Bluebird.all(applications).map(application => application.id);

    const job = { applicationIds, userId: user.id };

    await sideHustleNotifications(job);

    // Expected to send an email with all applications
    expect(sendgridStub).to.has.callCount(1);
    // Expected to send one intro message, plus one message for every application
    expect(twilioStub).to.have.callCount(3);
  });

  it('should only send sms notifications if user has no email', async () => {
    const sendgridSpy = sandbox.spy(sendgrid, 'sendDynamic');
    const twilioStub = sandbox.stub(twilio, 'send');

    const user = await factory.create('user', {}, { hasSession: true });

    const testJobIds = [jobs.instacart.id, jobs.uber.id];
    const applications = testJobIds.map(sideHustleJobId => {
      return factory.create('side-hustle-application', {
        sideHustleJobId,
        userId: user.id,
        status: Status.REQUESTED,
      });
    });

    const applicationIds = await Bluebird.all(applications).map(application => application.id);

    const job = { applicationIds, userId: user.id };

    await sideHustleNotifications(job);

    sinon.assert.notCalled(sendgridSpy);
    sinon.assert.calledThrice(twilioStub);
  });

  it('should update application status to CONTACTED after successfully sending notifications', async () => {
    sandbox.stub(sendgrid, 'sendDynamic').resolves([
      {
        statusCode: 202,
      },
    ]);
    sandbox.stub(twilio, 'send').resolves();

    const user = await factory.create('user', {}, { hasSession: true });

    const application = await factory.create('side-hustle-application', {
      sideHustleJobId: jobs.instacart.id,
      userId: user.id,
      status: Status.REQUESTED,
    });

    const job = { applicationIds: [application.id], userId: user.id };

    await sideHustleNotifications(job);

    const updatedApplication = await SideHustleApplication.findByPk(application.id);

    expect(updatedApplication.status).to.equal('CONTACTED');
  });

  it('should NOT update application status to CONTACTED after failure to send email', async () => {
    sandbox.stub(sendgrid, 'sendDynamic').rejects();
    sandbox.stub(twilio, 'send').resolves();

    const user = await factory.create(
      'user',
      { email: 'something@something.com' },
      { hasSession: true },
    );

    const application = await factory.create('side-hustle-application', {
      sideHustleJobId: jobs.airbnb.id,
      userId: user.id,
      status: Status.REQUESTED,
    });

    const job = { applicationIds: [application.id], userId: user.id };

    try {
      await sideHustleNotifications(job);
    } catch (error) {}

    const updatedApplication = await SideHustleApplication.findByPk(application.id);

    expect(updatedApplication.status).to.equal('REQUESTED');
  });

  it('should NOT update application status to CONTACTED after failure to send sms messages', async () => {
    sandbox.stub(sendgrid, 'sendDynamic').resolves([
      {
        statusCode: 202,
      },
    ]);
    sandbox.stub(twilio, 'send').rejects();

    const user = await factory.create('user', {}, { hasSession: true });

    const application = await factory.create('side-hustle-application', {
      sideHustleJobId: jobs.airbnb.id,
      userId: user.id,
      status: Status.REQUESTED,
    });

    const job = { applicationIds: [application.id], userId: user.id };

    try {
      await sideHustleNotifications(job);
    } catch (error) {}

    const updatedApplication = await SideHustleApplication.findByPk(application.id);

    expect(updatedApplication.status).to.equal('REQUESTED');
  });

  it('should successfully fire amplitude events after successfully sending notifications', async () => {
    sandbox.stub(sendgrid, 'sendDynamic').resolves([
      {
        statusCode: 202,
      },
    ]);
    sandbox.stub(twilio, 'send').resolves();

    const user = await factory.create(
      'user',
      { email: 'ultraRapidFire@riot.games' },
      { hasSession: true },
    );

    const testJobIds = [jobs.instacart.id, jobs.uber.id];
    const applications = testJobIds.map(sideHustleJobId => {
      return factory.create('side-hustle-application', {
        sideHustleJobId,
        userId: user.id,
        status: Status.REQUESTED,
      });
    });

    const applicationIds = await Bluebird.all(applications).map(application => application.id);

    const job = { applicationIds, userId: user.id };

    await sideHustleNotifications(job);

    expect(amplitudeStub).to.have.callCount(3);
    expect(amplitudeStub).to.have.been.calledWith({
      userId: user.id,
      eventType: 'side hustle notification sent',
      eventProperties: {
        source: 'email',
      },
    });
    expect(amplitudeStub).to.have.been.calledWith({
      userId: user.id,
      eventType: 'side hustle notification sent',
      eventProperties: {
        source: 'sms',
      },
    });
  });
});
