import { expect } from 'chai';
import calculateCanEditPaybackDate from '../../../../../src/services/internal-dashboard-api/domain/advance/can-edit-payback-date';
import { BillingStatus } from '../../../../../src/services/internal-dashboard-api/domain/advance/statuses-and-flags';
import { clean } from '../../../../test-helpers';

describe('advance.calculateCanEditPaybackDate', () => {
  before(() => clean());

  afterEach(() => clean());

  describe('Is true if billing status is', () => {
    (['OPEN', 'PAST DUE', 'ISSUE'] as BillingStatus[]).forEach(billingStatus => {
      it(`${billingStatus}`, () => {
        const canEditPaybackDate = calculateCanEditPaybackDate(billingStatus);

        expect(canEditPaybackDate).to.be.true;
      });
    });
  });

  describe('Is false if billing status is', () => {
    (['PAID', 'CANCELED'] as BillingStatus[]).forEach(billingStatus => {
      it(`${billingStatus}`, () => {
        const canEditPaybackDate = calculateCanEditPaybackDate(billingStatus);

        expect(canEditPaybackDate).to.be.false;
      });
    });
  });
});
