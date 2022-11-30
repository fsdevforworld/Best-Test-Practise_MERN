import { expect } from 'chai';
import calculateCanEditFee from '../../../../../src/services/internal-dashboard-api/domain/advance/can-edit-fee';
import { BillingStatus } from '../../../../../src/services/internal-dashboard-api/domain/advance/statuses-and-flags';
import { clean } from '../../../../test-helpers';

describe('advance.calculateCanEditFee', () => {
  before(() => clean());

  afterEach(() => clean());

  describe('Is true if billing status is', () => {
    (['OPEN', 'PAST DUE'] as BillingStatus[]).forEach(billingStatus => {
      it(`${billingStatus}`, () => {
        const canEditFee = calculateCanEditFee(billingStatus);

        expect(canEditFee).to.be.true;
      });
    });
  });

  describe('Is false if billing status is', () => {
    (['PAID', 'CANCELED', 'ISSUE'] as BillingStatus[]).forEach(billingStatus => {
      it(`${billingStatus}`, () => {
        const canEditFee = calculateCanEditFee(billingStatus);

        expect(canEditFee).to.be.false;
      });
    });
  });
});
