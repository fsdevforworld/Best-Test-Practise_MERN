import { expect } from 'chai';
import * as sinon from 'sinon';
import { updateBraze } from '../../../src/jobs/handlers';
import braze from '../../../src/lib/braze';
import { dogstatsd } from '../../../src/lib/datadog-statsd';
import { BrazeError } from '../../../src/lib/error';
import logger from '../../../src/lib/logger';
import { moment, Moment } from '@dave-inc/time-lib';
import { AnalyticsEvent } from '../../../src/typings';
import { clean, fakeDateTime, getBrazeUserData, replayHttp } from '../../test-helpers';

describe('Job: update-braze', () => {
  const sandbox = sinon.createSandbox();
  let loggerStub: sinon.SinonStub;
  let datadogStub: sinon.SinonStub;
  let brazeSpy: sinon.SinonSpy;
  let userId: number;
  let now: Moment;
  let previousEmail: string;

  before(() => clean);
  beforeEach(() => {
    loggerStub = sandbox.stub(logger, 'error');
    datadogStub = sandbox.stub(dogstatsd, 'increment');
    brazeSpy = sandbox.spy(braze, 'track');
    userId = 4564;
    now = moment('2020-06-16T18:10:30Z');
    fakeDateTime(sandbox, now);
  });
  afterEach(() => clean(sandbox));

  async function resetBrazeUserData() {
    const prevPhone = '+15554443333';
    previousEmail = 'oldEmail@gmail.com';
    const prevCity = 'Brooklyn';
    const prevCountry = 'US';
    const prevFirstName = 'Wyclef';
    const prevLastName = 'Jean';
    const prevDob = '1969-10-17';

    return braze.track({
      attributes: [
        {
          externalId: `${userId}`,
          phone: prevPhone,
          dob: prevDob,
          email: previousEmail,
          country: prevCountry,
          home_city: prevCity,
          firstName: prevFirstName,
          lastName: prevLastName,
        },
      ],
    });
  }

  it('should log an error if userId is not provided', async () => {
    await expect(updateBraze({ userId: null }));
    expect(loggerStub).to.be.calledWithExactly('Incomplete payload for updateBraze task', {
      userId: null,
      attributes: undefined,
      eventProperties: undefined,
    });
    expect(datadogStub).to.be.calledWithExactly('update_braze_task.incomplete_payload');
  });

  it('should log an error if neither attributes nor eventProperties are provided', async () => {
    await expect(updateBraze({ userId }));
    expect(loggerStub).to.be.calledWithExactly('Incomplete payload for updateBraze task', {
      userId,
      attributes: undefined,
      eventProperties: undefined,
    });
    expect(datadogStub).to.be.calledWithExactly('update_braze_task.incomplete_payload');
  });

  it(
    'should call track with phone update',
    replayHttp('jobs/update-braze/phone-update.json', async () => {
      await resetBrazeUserData();

      const newPhoneNumber = '+13334445555';
      const attributes = { phoneNumber: newPhoneNumber };
      const eventProperties = { name: AnalyticsEvent.PhoneNumberUpdated };
      await updateBraze({ userId, attributes, eventProperties });
      const [{ events }] = brazeSpy.secondCall.args;
      expect(events[0].name).to.equal(AnalyticsEvent.PhoneNumberUpdated);
      expect(events[0].externalId).to.equal(userId.toString());
      expect(events[0].time).to.be.sameMoment(now);

      const brazeUserResponse = await getBrazeUserData([userId.toString()], ['phone']);
      expect(brazeUserResponse.body.users[0].phone).to.equal(newPhoneNumber.replace('+', ''));
    }),
  );

  it(
    'should call track with email update',
    replayHttp('jobs/update-braze/email-update.json', async () => {
      await resetBrazeUserData();

      const newEmail = 'newEmail@gmail.com';
      const eventProperties = {
        name: AnalyticsEvent.EmailUpdated,
        properties: { previousEmail, newEmail },
      };
      const attributes = { email: newEmail };
      await updateBraze({ userId, attributes, eventProperties });
      const [{ events }] = brazeSpy.secondCall.args;
      expect(events[0].time).to.be.sameMoment(now);
      expect(events[0].externalId).to.equal(userId.toString());
      expect(events[0].name).to.equal(AnalyticsEvent.EmailUpdated);
      expect(events[0].properties.previousEmail).to.equal(previousEmail);
      expect(events[0].properties.newEmail).to.equal(newEmail);

      const brazeUserResponse = await getBrazeUserData([userId.toString()], ['email']);
      expect(brazeUserResponse.body.users[0].email).to.equal(newEmail.toLowerCase());
    }),
  );

  it(
    'should call track with address update',
    replayHttp('jobs/update-braze/address-update.json', async () => {
      await resetBrazeUserData();

      const city = 'San Juan';
      const country = 'PR';
      const attributes = { city, country };
      const eventProperties = { name: AnalyticsEvent.AddressUpdated };
      await updateBraze({ userId, attributes, eventProperties });
      const [{ events }] = brazeSpy.secondCall.args;
      expect(events[0].name).to.equal(AnalyticsEvent.AddressUpdated);
      expect(events[0].externalId).to.equal(userId.toString());
      expect(events[0].time).to.be.sameMoment(now);

      const brazeUserResponse = await getBrazeUserData(
        [userId.toString()],
        ['home_city', 'country'],
      );
      expect(brazeUserResponse.body.users[0].home_city).to.equal(city);
      expect(brazeUserResponse.body.users[0].country).to.equal(country);
    }),
  );

  it(
    'should call track with password update',
    replayHttp('jobs/update-braze/password-update.json', async () => {
      const eventProperties = { name: AnalyticsEvent.PasswordUpdated };
      await updateBraze({ userId, eventProperties });
      const [[{ events }]] = brazeSpy.args;
      expect(events[0].name).to.equal(AnalyticsEvent.PasswordUpdated);
      expect(events[0].externalId).to.equal(userId.toString());
      expect(events[0].time).to.be.sameMoment(now);
    }),
  );

  it(
    'should call track with email unverified',
    replayHttp('jobs/update-braze/email-unverified.json', async () => {
      const email = 'd***e@dave.com';
      const eventProperties = {
        name: AnalyticsEvent.EmailUnverified,
        properties: { email },
      };
      await updateBraze({ userId, eventProperties });
      const [[{ events }]] = brazeSpy.args;
      expect(events[0].name).to.equal(AnalyticsEvent.EmailUnverified);
      expect(events[0].properties.email).to.equal(email);
      expect(events[0].externalId).to.equal(userId.toString());
      expect(events[0].time).to.be.sameMoment(now);
    }),
  );

  it(
    'should call track with birthdate update',
    replayHttp('jobs/update-braze/birthdate-update.json', async () => {
      await resetBrazeUserData();

      const attributes = { birthdate: '2000-12-31' };
      await updateBraze({ userId, attributes });
      const brazeUserResponse = await getBrazeUserData([userId.toString()], ['dob']);
      expect(moment(brazeUserResponse.body.users[0].dob)).to.be.sameMoment(
        moment(attributes.birthdate),
      );
    }),
  );

  it(
    'should call track with multiple updates',
    replayHttp('jobs/update-braze/multiple-updates.json', async () => {
      await resetBrazeUserData();

      const firstName = 'Ms. Lauryn';
      const lastName = 'Hill';
      const city = 'Newark';
      const country = 'US';
      const attributes = { city, country, firstName, lastName };
      const eventProperties = [
        { name: AnalyticsEvent.AddressUpdated },
        { name: AnalyticsEvent.NameUpdated },
      ];
      await updateBraze({ userId, attributes, eventProperties });
      const [{ events }] = brazeSpy.secondCall.args;
      expect([AnalyticsEvent.AddressUpdated, AnalyticsEvent.NameUpdated]).to.include(
        events[0].name,
      );
      expect([AnalyticsEvent.AddressUpdated, AnalyticsEvent.NameUpdated]).to.include(
        events[1].name,
      );
      expect(events[0].externalId).to.equal(userId.toString());
      expect(events[1].externalId).to.equal(userId.toString());
      expect(events[0].time).to.be.sameMoment(now);
      expect(events[1].time).to.be.sameMoment(now);
      const brazeUserResponse = await getBrazeUserData(
        [userId.toString()],
        ['first_name', 'last_name', 'home_city', 'country'],
      );
      expect(brazeUserResponse.body.users[0].first_name).to.equal(firstName);
      expect(brazeUserResponse.body.users[0].last_name).to.equal(lastName);
      expect(brazeUserResponse.body.users[0].home_city).to.equal(city);
      expect(brazeUserResponse.body.users[0].country).to.equal(country);
    }),
  );

  it('logs and tracks errors', async () => {
    sandbox.restore();
    const brazeError = new BrazeError('Some messages failed', {
      data: { errors: 'the thing that went wrong' },
      failingService: 'braze',
      gatewayService: 'node-api',
    });
    sandbox.stub(braze, 'track').rejects(brazeError);
    loggerStub = sandbox.stub(logger, 'error');
    datadogStub = sandbox.stub(dogstatsd, 'increment');
    await expect(
      updateBraze({ userId, attributes: { phoneNumber: 'some phone' } }),
    ).to.be.rejectedWith(BrazeError);
    expect(loggerStub).calledWithMatch(sinon.match.string, { error: sinon.match.any, userId });
    expect(datadogStub).to.be.calledWithExactly('update_braze_task.error');
  });
});
