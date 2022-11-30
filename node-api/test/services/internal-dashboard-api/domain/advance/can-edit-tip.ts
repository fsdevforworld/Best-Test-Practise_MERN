import { expect } from 'chai';
import calculateCanEditTip from '../../../../../src/services/internal-dashboard-api/domain/advance/can-edit-tip';
import { BillingStatus } from '../../../../../src/services/internal-dashboard-api/domain/advance/statuses-and-flags';
import { clean } from '../../../../test-helpers';

describe('advance.calculateCanEditTip', () => {
  before(() => clean());

  afterEach(() => clean());

  describe('Is true if billing status is', () => {
    (['OPEN', 'PAST DUE'] as BillingStatus[]).forEach(billingStatus => {
      it(`${billingStatus}`, () => {
        const canEditTip = calculateCanEditTip(billingStatus);

        expect(canEditTip).to.be.true;
      });
    });
  });

  describe('Is false if billing status is', () => {
    (['PAID', 'CANCELED', 'ISSUE'] as BillingStatus[]).forEach(billingStatus => {
      it(`${billingStatus}`, () => {
        const canEditTip = calculateCanEditTip(billingStatus);

        expect(canEditTip).to.be.false;
      });
    });
  });
});
