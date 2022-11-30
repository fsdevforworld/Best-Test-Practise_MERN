import { expect } from 'chai';
/* tslint:disable-next-line:no-require-imports */
import MockExpressRequest = require('mock-express-request');
import factory from '../../../factories';
import { clean } from '../../../test-helpers';
import { validateCreate } from '../../../../src/api/v2/phone-number-change-request/validator';
import { IDaveRequest } from '../../../../src/typings';
import { AlreadyExistsError, NotFoundError, RateLimitError } from '../../../../src/lib/error';
import {
  InvalidParametersMessageKey,
  NotFoundMessageKey,
  RateLimitMessageKey,
} from '../../../../src/translations';

type validateCreateRequestBody = {
  oldPhone: string;
  newPhone: string;
  ip: string;
};

describe('Phone Number Change Request Validators', () => {
  before(() => clean());
  afterEach(() => clean());

  describe('validateCreate', () => {
    const oldPhoneNumber = '+11000000011';
    const newPhoneNumber = '+12813308004';

    const createReq = ({ ip, oldPhone, newPhone }: validateCreateRequestBody): IDaveRequest =>
      new MockExpressRequest({
        body: { oldPhoneNumber: oldPhone, newPhoneNumber: newPhone },
        connection: { ip },
      }) as IDaveRequest;

    context('Rate Limit', () => {
      const failSafeValidateCreate = async ({
        oldPhone,
        newPhone,
        ip,
      }: validateCreateRequestBody) => {
        try {
          const req = createReq({ ip, oldPhone, newPhone });
          await validateCreate(req);
        } catch {}
      };

      it('rate limits requests by ip', async () => {
        await failSafeValidateCreate({
          ip: '1.2.3.4',
          oldPhone: '1234567890',
          newPhone: '2345678901',
        });
        await failSafeValidateCreate({
          ip: '1.2.3.4',
          oldPhone: '1234567891',
          newPhone: '2345678902',
        });
        await failSafeValidateCreate({
          ip: '1.2.3.4',
          oldPhone: '1234567892',
          newPhone: '2345678903',
        });
        await failSafeValidateCreate({
          ip: '1.2.3.4',
          oldPhone: '1234567893',
          newPhone: '2345678904',
        });
        await failSafeValidateCreate({
          ip: '1.2.3.4',
          oldPhone: '1234567894',
          newPhone: '2345678905',
        });

        const req = createReq({ ip: '1.2.3.4', oldPhone: '1234567895', newPhone: '2345678906' });
        await expect(validateCreate(req)).to.rejectedWith(
          RateLimitError,
          RateLimitMessageKey.TooManyRequests,
        );
      });

      it('rate limits requests by old phone number', async () => {
        await failSafeValidateCreate({
          ip: '1.2.3.4',
          oldPhone: oldPhoneNumber,
          newPhone: '2345678901',
        });
        await failSafeValidateCreate({
          ip: '1.2.3.5',
          oldPhone: oldPhoneNumber,
          newPhone: '2345678902',
        });
        await failSafeValidateCreate({
          ip: '1.2.3.6',
          oldPhone: oldPhoneNumber,
          newPhone: '2345678903',
        });
        await failSafeValidateCreate({
          ip: '1.2.3.7',
          oldPhone: oldPhoneNumber,
          newPhone: '2345678904',
        });
        await failSafeValidateCreate({
          ip: '1.2.3.8',
          oldPhone: oldPhoneNumber,
          newPhone: '2345678905',
        });

        const req = createReq({ ip: '1.2.3.9', oldPhone: oldPhoneNumber, newPhone: '2345678906' });
        await expect(validateCreate(req)).to.rejectedWith(
          RateLimitError,
          RateLimitMessageKey.TooManyRequests,
        );
      });

      it('rate limits requests by new phone number', async () => {
        await failSafeValidateCreate({
          ip: '1.2.3.4',
          oldPhone: '1234567890',
          newPhone: newPhoneNumber,
        });
        await failSafeValidateCreate({
          ip: '1.2.3.5',
          oldPhone: '1234567891',
          newPhone: newPhoneNumber,
        });
        await failSafeValidateCreate({
          ip: '1.2.3.6',
          oldPhone: '1234567892',
          newPhone: newPhoneNumber,
        });
        await failSafeValidateCreate({
          ip: '1.2.3.7',
          oldPhone: '1234567893',
          newPhone: newPhoneNumber,
        });
        await failSafeValidateCreate({
          ip: '1.2.3.8',
          oldPhone: '1234567894',
          newPhone: newPhoneNumber,
        });

        const req = createReq({ ip: '1.2.3.9', oldPhone: '1234567895', newPhone: newPhoneNumber });
        await expect(validateCreate(req)).to.rejectedWith(
          RateLimitError,
          RateLimitMessageKey.TooManyRequests,
        );
      });
    });

    it('should not throw an error', async () => {
      await factory.create('user', { phoneNumber: oldPhoneNumber, email: 'rick@morty.com' });
      const req = createReq({ ip: '1.2.3.4', oldPhone: oldPhoneNumber, newPhone: newPhoneNumber });
      await validateCreate(req);
    });

    it('should throw an AlreadyExistsError if new number already belongs to another user', async () => {
      await factory.create('user', { phoneNumber: newPhoneNumber });
      const req = createReq({ ip: '1.2.3.4', oldPhone: oldPhoneNumber, newPhone: newPhoneNumber });
      await expect(validateCreate(req)).to.rejectedWith(
        AlreadyExistsError,
        InvalidParametersMessageKey.NewPhoneNumberAlreadyUsed,
      );
    });

    it('should throw a NotFoundError if no user is found with old phone number', async () => {
      const req = createReq({ ip: '1.2.3.4', oldPhone: oldPhoneNumber, newPhone: newPhoneNumber });
      await expect(validateCreate(req)).to.rejectedWith(
        NotFoundError,
        NotFoundMessageKey.PhoneNumberNotFound,
      );
    });
  });
});
