import { expect } from 'chai';
import * as sinon from 'sinon';
import factory from '../../../factories';
import { clean, createVerificationCode } from '../../../test-helpers';
import { createPhoneNumberChangeRequest } from '../../../../src/api/v2/phone-number-change-request/controller';
import { InvalidVerificationError } from '../../../../src/lib/error';
import { InvalidParametersMessageKey } from '../../../../src/translations';
import { AuditLog, PhoneNumberChangeRequest } from '../../../../src/models';
import sendgrid from '../../../../src/lib/sendgrid';
import * as eventDomain from '../../../../src/domain/event';
import * as Jobs from '../../../../src/jobs/data';
import { AnalyticsEvent } from '../../../../src/typings';

describe('Phone Number Change Request Controllers', () => {
  const sandbox = sinon.createSandbox();
  let sinonStub: sinon.SinonStub;

  before(() => clean());
  beforeEach(() => {
    sinonStub = sandbox.stub(sendgrid, 'send').resolves();
  });
  afterEach(() => clean(sandbox));

  describe('createPhoneNumberChangeRequest', () => {
    const oldPhoneNumber = '+11000000011';
    const newPhoneNumber = '+12813308004';
    const code = '111222';

    it('should send email to verify a phone number change request if email exists', async () => {
      const user = await factory.create('user', {
        phoneNumber: oldPhoneNumber,
        email: 'jeff@gotham.corp',
      });
      await createVerificationCode({ phoneNumber: newPhoneNumber, code });

      const { emailSent } = await createPhoneNumberChangeRequest({
        user,
        oldPhoneNumber,
        newPhoneNumber,
        code,
      });

      const [phoneNumberChangeRequest, auditLog] = await Promise.all([
        PhoneNumberChangeRequest.findOne({
          where: { oldPhoneNumber },
        }),
        AuditLog.findOne({ where: { userId: user.id } }),
      ]);

      sinon.assert.calledOnce(sinonStub);
      expect(emailSent).to.be.true;
      expect(phoneNumberChangeRequest.newPhoneNumber).to.be.eq('+12813308004');
      expect(phoneNumberChangeRequest.userId).to.be.eq(user.id);
      expect(phoneNumberChangeRequest.verificationCode).to.exist;
      expect(phoneNumberChangeRequest.verified).to.be.null;
      expect(auditLog.type).to.be.eq('PHONE_NUMBER_CHANGE_REQUEST_CREATED');
      expect(auditLog.extra).to.deep.eq({
        oldPhoneNumber,
        newPhoneNumber,
        emailSent: true,
      });
    });

    it('should should not send email if user has no email and has bank accounts', async () => {
      const user = await factory.create('user', {
        phoneNumber: oldPhoneNumber,
      });
      await factory.create('bank-account', { userId: user.id });
      await createVerificationCode({ phoneNumber: newPhoneNumber, code });

      const { emailSent, id } = await createPhoneNumberChangeRequest({
        user,
        oldPhoneNumber,
        newPhoneNumber,
        code,
      });

      const [phoneNumberChangeRequest, auditLog] = await Promise.all([
        PhoneNumberChangeRequest.findOne({
          where: { oldPhoneNumber },
        }),
        AuditLog.findOne({ where: { userId: user.id } }),
      ]);

      sinon.assert.notCalled(sinonStub);
      expect(id).to.be.eq(phoneNumberChangeRequest.id);
      expect(emailSent).to.be.false;
      expect(phoneNumberChangeRequest.newPhoneNumber).to.be.eq('+12813308004');
      expect(phoneNumberChangeRequest.userId).to.be.eq(user.id);
      expect(phoneNumberChangeRequest.verificationCode).to.be.null;
      expect(phoneNumberChangeRequest.verified).to.be.null;
      expect(auditLog.type).to.be.eq('PHONE_NUMBER_CHANGE_REQUEST_CREATED');
      expect(auditLog.extra).to.deep.eq({
        oldPhoneNumber,
        newPhoneNumber,
        emailSent: false,
      });
    });

    it('should throw a InvalidVerificationError if the code is invalid', async () => {
      const user = await factory.create('user', {
        phoneNumber: oldPhoneNumber,
      });
      await createVerificationCode({ phoneNumber: newPhoneNumber, code });

      await expect(
        createPhoneNumberChangeRequest({
          user,
          oldPhoneNumber,
          newPhoneNumber,
          code: '123456',
        }),
      ).to.be.rejectedWith(
        InvalidVerificationError,
        InvalidParametersMessageKey.InvalidVerificationCode,
      );
    });

    it('should update the user when they do not have email or bank account', async () => {
      const updateSynapsepayUserJobStub = sandbox.stub(Jobs, 'updateSynapsepayUserTask').resolves();
      const updateBrazeJobStub = sandbox.stub(Jobs, 'updateBrazeTask').resolves();
      const userUpdatedEventPublishStub = sandbox
        .stub(eventDomain.userUpdatedEvent, 'publish')
        .resolves();
      const user = await factory.create('user', { phoneNumber: oldPhoneNumber });
      await createVerificationCode({ phoneNumber: newPhoneNumber, code });

      await createPhoneNumberChangeRequest({
        user,
        oldPhoneNumber,
        newPhoneNumber,
        code,
      });

      const changeRequest = await PhoneNumberChangeRequest.findOne({
        where: { oldPhoneNumber },
      });
      await user.reload();
      expect(changeRequest.verified).to.exist;
      expect(user.phoneNumber).to.equal('+12813308004');
      sinon.assert.calledWithExactly(updateSynapsepayUserJobStub, { userId: user.id });
      sinon.assert.calledWithExactly(userUpdatedEventPublishStub, {
        phoneChanged: true,
        userId: user.id,
      });
      sinon.assert.calledWithExactly(updateBrazeJobStub, {
        userId: user.id,
        attributes: { phoneNumber: newPhoneNumber },
        eventProperties: { name: AnalyticsEvent.PhoneNumberUpdated },
      });
    });

    it('should update the user when they do not have email/bank account when an error occurs while enqueing UpdateSynapsepayUser job', async () => {
      const updateSynapsepayUserJobStub = sandbox.stub(Jobs, 'updateSynapsepayUserTask').resolves();
      const updateBrazeJobStub = sandbox.stub(Jobs, 'updateBrazeTask').resolves();
      const userUpdatedEventPublishStub = sandbox
        .stub(eventDomain.userUpdatedEvent, 'publish')
        .resolves();
      const user = await factory.create('user', { phoneNumber: oldPhoneNumber });
      await createVerificationCode({ phoneNumber: newPhoneNumber, code });

      await createPhoneNumberChangeRequest({
        user,
        oldPhoneNumber,
        newPhoneNumber,
        code,
      });

      const changeRequest = await PhoneNumberChangeRequest.findOne({
        where: { oldPhoneNumber },
      });
      await user.reload();
      expect(changeRequest.verified).to.exist;
      expect(user.phoneNumber).to.equal('+12813308004');
      sinon.assert.calledWithExactly(updateSynapsepayUserJobStub, { userId: user.id });
      sinon.assert.calledWithExactly(userUpdatedEventPublishStub, {
        phoneChanged: true,
        userId: user.id,
      });
      sinon.assert.calledWithExactly(updateBrazeJobStub, {
        userId: user.id,
        attributes: { phoneNumber: newPhoneNumber },
        eventProperties: { name: AnalyticsEvent.PhoneNumberUpdated },
      });
    });
  });
});
