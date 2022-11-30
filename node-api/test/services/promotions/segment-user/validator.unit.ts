import { expect } from 'chai';
import { validateCreateSegmentUser } from '../../../../src/services/promotions/segment-user/validator';
import { IDaveRequest } from '../../../../src/typings';
import { InvalidParametersError } from '../../../../src/lib/error';
import { InvalidParametersMessageKey } from '../../../../src/translations';

/* tslint:disable-next-line:no-require-imports */
import MockExpressRequest = require('mock-express-request');

describe('Segment User validators', () => {
  describe('validateCreateSegmentUser', () => {
    it('should return user id, campaign id and referrer id on successful validation', () => {
      const segmentId = 'Jeff4President';
      const referrerId = 1;
      const userId = 2;
      const req = new MockExpressRequest({
        body: {
          segmentId,
          referrerId,
        },
        user: { id: userId },
      });
      const response = validateCreateSegmentUser(req as IDaveRequest);
      expect(response.userId).to.be.eq(userId);
      expect(response.segmentId).to.be.eq(segmentId);
      expect(response.referrerId).to.be.eq(referrerId);
    });

    it('should throw an InvalidParametersError if campaign id was not passed in', () => {
      const referrerId = 1;
      const userId = 2;
      const req = new MockExpressRequest({
        body: {
          referrerId,
        },
        user: { id: userId },
      });
      expect(() => validateCreateSegmentUser(req as IDaveRequest)).to.throw(
        InvalidParametersError,
        InvalidParametersMessageKey.BaseInvalidParametersError,
      );
    });
  });
});
