import { expect } from 'chai';
import * as sinon from 'sinon';
import factory from '../factories';
import { clean } from '../test-helpers';
import SideHustleApplicationsHelper from '../../src/helper/side-hustle-application';
import twilio from '../../src/lib/twilio';
import { SideHustleJob, SideHustleApplication, User, SideHustleProvider } from '../../src/models';
import { HustlePartner } from '@dave-inc/wire-typings';

describe('sendAffiliatesSMS', async () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());
  afterEach(() => clean(sandbox));

  it('should send SMS message with sms blurb when it exists', async () => {
    const twilioStub = sandbox.stub(twilio, 'send').resolves();
    const shp = await factory.create<SideHustleProvider>('side-hustle-provider', {
      name: HustlePartner.Dave,
      isDaveAuthority: true,
    });
    const [sideHustleJob1, sideHustleJob2, user] = await Promise.all([
      factory.create<SideHustleJob>('side-hustle-job', {
        company: 'Rover',
        smsBlurb: 'red rover red rover send Dave right over',
        sideHustleProviderId: shp.id,
        externalId: 'Rover',
      }),

      factory.create<SideHustleJob>('side-hustle-job', {
        company: 'Revor',
        sideHustleProviderId: shp.id,
        externalId: 'Revor',
      }),
      factory.create<User>('user'),
    ]);

    const [app1, app2] = await Promise.all([
      factory.create<SideHustleApplication>('side-hustle-application', {
        userId: user.id,
        sideHustleJobId: sideHustleJob1.id,
      }),
      factory.create<SideHustleApplication>('side-hustle-application', {
        userId: user.id,
        sideHustleJobId: sideHustleJob2.id,
      }),
    ]);

    const applications = await SideHustleApplication.findAll({
      where: { userId: user.id },
      include: [SideHustleJob],
    });

    await SideHustleApplicationsHelper.sendAffiliatesSMS(applications, user.id, user.phoneNumber);

    const msg1 = `${sideHustleJob1.company} - ${sideHustleJob1.smsBlurb}\nhttps://go.dave.com/r?t=sh&aid=${app1.id}&s=sms&jid=${sideHustleJob1.id}`;
    const msg2 = `${sideHustleJob2.company} - https://go.dave.com/r?t=sh&aid=${app2.id}&s=sms&jid=${sideHustleJob2.id}`;

    const twilioCalls = twilioStub.getCalls().map(c => c.args);
    expect(twilioCalls).to.deep.include([msg1, user.phoneNumber]);
    expect(twilioCalls).to.deep.include([msg2, user.phoneNumber]);
  });
});
