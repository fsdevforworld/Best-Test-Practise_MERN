import { moment } from '@dave-inc/time-lib';
import { expect } from 'chai';
import * as sinon from 'sinon';
import {
  client as DaveBankingClient,
  sendResetPasswordEmail,
  updateNameAndLicense,
  verifyDaveBankingSSN,
} from '../../../../src/api/v2/user/controller';
import { userUpdatedEvent } from '../../../../src/domain/event';
import * as Jobs from '../../../../src/jobs/data';
import { dogstatsd } from '../../../../src/lib/datadog-statsd';
import {
  InvalidCredentialsError,
  InvalidParametersError,
  SendgridEmailError,
} from '../../../../src/lib/error';
import sendgrid from '../../../../src/lib/sendgrid';
import twilio from '../../../../src/lib/twilio';
import { AuditLog, SynapsepayDocument, User } from '../../../../src/models';
import { FailureMessageKey, InvalidCredentialsMessageKey } from '../../../../src/translations';
import { AnalyticsEvent, SynapsepayDocumentLicenseStatus } from '../../../../src/typings';
import { generateLicense, setupSynapsePayUser } from '../../../domain/synapsepay/test-utils';
import factory from '../../../factories';
import { clean, replayHttp } from '../../../test-helpers';

describe('User Controller', () => {
  const sandbox = sinon.createSandbox();
  let updateBrazeJobStub: sinon.SinonStub;
  let userUpdatedEventStub: sinon.SinonStub;

  before(() => clean());
  beforeEach(() => {
    updateBrazeJobStub = sandbox.stub(Jobs, 'updateBrazeTask');
    userUpdatedEventStub = sandbox.stub(userUpdatedEvent, 'publish');
  });

  afterEach(() => clean(sandbox));

  describe('updateNameAndLicense', () => {
    const birthdate = moment('1999-03-27', 'YYYY-MM-DD');
    it(
      "should update a user's name and update audit log/braze when synapse document is already created",
      replayHttp('api/user/update-name-existing-user.json', async () => {
        const userId = 590;
        const firstName = 'Mary';
        const lastName = 'Roberts';
        const user = await setupSynapsePayUser({
          userId,
          firstName,
          lastName,
          birthdate: '2000-09-30',
        });
        const licenseFile = generateLicense();
        expect(user.firstName).to.be.eq(firstName);
        expect(user.lastName).to.be.eq(lastName);
        await updateNameAndLicense(user, '12.12.12.12', {
          birthdate,
          firstName: 'Jeffrey',
          lastName: 'Lee',
          licenseFile,
        });
        await user.reload();

        expect(user.firstName).to.be.eq('Jeffrey');
        expect(user.lastName).to.be.eq('Lee');
        expect(user.birthdate).to.be.sameMoment(birthdate);

        const [synapsepayDocument, auditLog] = await Promise.all([
          SynapsepayDocument.findOne({
            where: { userId: user.id },
          }),
          AuditLog.findOne({
            where: { userId: user.id, type: AuditLog.TYPES.USER_PROFILE_UPDATE_NAME },
          }),
        ]);

        expect(synapsepayDocument.name).to.be.eq('Jeffrey Lee');
        expect(synapsepayDocument.day).to.eq('27');
        expect(synapsepayDocument.month).to.eq('3');
        expect(synapsepayDocument.year).to.eq('1999');
        expect(synapsepayDocument.licenseStatus).to.eq(SynapsepayDocumentLicenseStatus.Reviewing);
        expect(auditLog.extra.modifications).to.be.deep.eq({
          firstName: {
            previousValue: 'Mary',
            currentValue: 'Jeffrey',
          },
          lastName: {
            previousValue: 'Roberts',
            currentValue: 'Lee',
          },
          birthdate: {
            previousValue: '2000-09-30T00:00:00.000Z',
            currentValue: '1999-03-27T00:00:00.000Z',
          },
        });
        sinon.assert.calledWithExactly(updateBrazeJobStub, {
          userId: user.id,
          attributes: {
            firstName: 'Jeffrey',
            lastName: 'Lee',
            birthdate: birthdate.format('YYYY-MM-DD'),
          },
          eventProperties: [{ name: AnalyticsEvent.NameUpdated }],
        });
        sinon.assert.calledWithExactly(userUpdatedEventStub, {
          userId: user.id,
          nameChanged: true,
        });
      }),
    );

    it(
      "should update a user's name and update audit log/braze when synapse document does not exist",
      replayHttp('api/user/update-name-new-user.json', async () => {
        const user = await factory.create<User>('user', {
          id: 453890,
          firstName: 'Mary',
          lastName: 'Roberts',
          phoneNumber: '+19896743487',
          synapsepayId: null,
        });
        const licenseFile = generateLicense();

        await updateNameAndLicense(user, '12.12.12.12', {
          birthdate,
          firstName: 'Jeffrey',
          lastName: 'Lee',
          licenseFile,
        });
        await user.reload();

        expect(user.firstName).to.be.eq('Jeffrey');
        expect(user.lastName).to.be.eq('Lee');
        expect(user.birthdate).to.be.sameMoment(birthdate);

        const [synapsepayDocument, auditLog] = await Promise.all([
          SynapsepayDocument.findOne({
            where: { userId: user.id },
          }),
          AuditLog.findOne({
            where: { userId: user.id, type: AuditLog.TYPES.USER_PROFILE_UPDATE_NAME },
          }),
        ]);

        expect(synapsepayDocument.name).to.be.eq('Jeffrey Lee');
        expect(synapsepayDocument.day).to.eq('27');
        expect(synapsepayDocument.month).to.eq('3');
        expect(synapsepayDocument.year).to.eq('1999');
        expect(synapsepayDocument.licenseStatus).to.eq(SynapsepayDocumentLicenseStatus.Reviewing);
        expect(synapsepayDocument.license).not.to.exist;
        expect(auditLog.extra.modifications).to.be.deep.eq({
          firstName: {
            previousValue: 'Mary',
            currentValue: 'Jeffrey',
          },
          lastName: {
            previousValue: 'Roberts',
            currentValue: 'Lee',
          },
          birthdate: {
            currentValue: '1999-03-27T00:00:00.000Z',
          },
        });
        sinon.assert.calledWithExactly(updateBrazeJobStub, {
          userId: user.id,
          attributes: {
            firstName: 'Jeffrey',
            lastName: 'Lee',
            birthdate: birthdate.format('YYYY-MM-DD'),
          },
          eventProperties: [{ name: AnalyticsEvent.NameUpdated }],
        });
      }),
    );
  });

  describe('sendResetPasswordEmail', () => {
    it('should send user password reset email', async () => {
      const user = await factory.create<User>('user');
      const sendgridSpy = sandbox.stub(sendgrid, 'send');
      await sendResetPasswordEmail(user);
      sinon.assert.calledOnce(sendgridSpy);
    });

    it('should throw a SendgridEmailError if sendgrid errors', async () => {
      const user = await factory.create<User>('user');
      const dogstatsdSpy = sandbox.spy(dogstatsd, 'increment');
      sandbox.stub(sendgrid, 'send').throws();
      await expect(sendResetPasswordEmail(user)).to.be.rejectedWith(
        SendgridEmailError,
        FailureMessageKey.PasswordResetEmailError,
      );
      sinon.assert.calledWith(dogstatsdSpy, 'user.send_reset_password_email.failed');
    });
  });

  describe('verifyDaveBankingSSN', () => {
    it('should successfully send verify ssn and send an MFA code without email', async () => {
      const user = await factory.create('user');
      sandbox.stub(DaveBankingClient, 'verifyUser').resolves({});
      sandbox.stub(twilio, 'getMobileInfo').resolves({ isMobile: true });
      const sendStub = sandbox.stub(twilio, 'send').resolves();
      await verifyDaveBankingSSN(user, '1234', undefined);
      sinon.assert.calledOnce(sendStub);
    });

    it('should successfully send verify ssn and send an MFA code with email', async () => {
      const user = await factory.create('user');
      sandbox.stub(DaveBankingClient, 'verifyUser').resolves({});
      const sendStub = sandbox.stub(sendgrid, 'send');
      await verifyDaveBankingSSN(user, '1234', 'allison@dave.com');
      sinon.assert.calledOnce(sendStub);
    });

    it('should throw an error if ssn provided fails verification from bank api', async () => {
      const user = await factory.create('user');
      const datadogSpy = sandbox.spy(dogstatsd, 'increment');
      sandbox.stub(DaveBankingClient, 'verifyUser').throws(new Error());
      await expect(verifyDaveBankingSSN(user, '1234', 'allison@dave.com')).to.be.rejectedWith(
        InvalidCredentialsError,
        InvalidCredentialsMessageKey.InvalidSSNLast4,
      );
      sinon.assert.calledWithExactly(
        datadogSpy,
        'user.verify_bank_ssn.failed.invalid_ssn_last_four',
      );
    });

    it('should pass through the underlying error if ssn passes verification from bank api and mfa code fails', async () => {
      const user = await factory.create('user');
      const datadogSpy = sandbox.spy(dogstatsd, 'increment');
      const expectedErrorMessage = 'Error sending MFA code, try texting START in all caps to 96419';

      sandbox.stub(DaveBankingClient, 'verifyUser').resolves();
      sandbox.stub(sendgrid, 'send').rejects(new InvalidParametersError(expectedErrorMessage));

      await expect(verifyDaveBankingSSN(user, '1234', 'allison@dave.com')).to.be.rejectedWith(
        InvalidParametersError,
        expectedErrorMessage,
      );

      expect(datadogSpy).to.have.been.calledWith('user.verify_bank_ssn.failed.invalid_mfa_code');
    });
  });
});
