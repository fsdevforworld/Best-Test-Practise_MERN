import { expect } from 'chai';
import {
  validateDeleteUserRequest,
  UNDEFINED_DELETE_USER_REASON,
} from '../../../../../src/api/v2/user/delete/validator';
import { IDaveRequest } from '../../../../../src/typings';
/* tslint:disable-next-line:no-require-imports */
import MockExpressRequest = require('mock-express-request');
import { UnauthorizedError } from '../../../../../src/lib/error';

describe('User Delete Validator', () => {
  describe('validateDeleteUserRequest', () => {
    it('should validate correctly formatted requests', () => {
      const req = new MockExpressRequest({
        body: { reason: 'hi', additionalInfo: 'stuff' },
        user: { id: 1 },
        params: { id: 1 },
      });
      const payload = validateDeleteUserRequest(req as IDaveRequest);
      expect(payload.additionalInfo).to.eq('stuff');
      expect(payload.id).to.eq(1);
      expect(payload.reason).to.eq('hi');
    });

    it('should throw an Unauthorized error if the user id doesnt match id in params', () => {
      const req = new MockExpressRequest({
        body: { reason: 'hi', additionalInfo: 'stuff' },
        user: { id: 2 },
        params: { id: 1 },
      });
      expect(() => validateDeleteUserRequest(req as IDaveRequest)).to.throw(UnauthorizedError);
    });

    it('should throw an Unauthorized error if the id in the params is NaN', () => {
      const req1 = new MockExpressRequest({
        body: { reason: 'hi', additionalInfo: 'stuff' },
        user: { id: 2 },
        params: {},
      });
      expect(() => validateDeleteUserRequest(req1 as IDaveRequest)).to.throw(UnauthorizedError);

      const req2 = new MockExpressRequest({
        body: { reason: 'hi', additionalInfo: 'stuff' },
        user: { id: 2 },
        params: { id: 'yeehaw' },
      });
      expect(() => validateDeleteUserRequest(req2 as IDaveRequest)).to.throw(UnauthorizedError);
    });

    it('should return a default delete reason if the reason is undefined', () => {
      const req = new MockExpressRequest({
        body: { additionalInfo: 'stuff' },
        user: { id: 2 },
        params: { id: 2 },
      });
      const payload = validateDeleteUserRequest(req as IDaveRequest);
      expect(payload.additionalInfo).to.eq('stuff');
      expect(payload.id).to.eq(2);
      expect(payload.reason).to.eq(UNDEFINED_DELETE_USER_REASON);
    });
  });
});
