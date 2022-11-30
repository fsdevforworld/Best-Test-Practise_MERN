import { expect } from 'chai';

import { shouldAuditLog } from '../../src/services/advance-approval/helpers';

describe('advanceApprovalClient', () => {
  describe('shouldAuditLog', () => {
    it('should not log if explicitly passed false and a nonallowed screen', () => {
      const result = shouldAuditLog('RandomScreen', false);

      expect(result).to.equal(false);
    });

    it('should not log if explicitly passed false and an allowed screen', () => {
      const result = shouldAuditLog('Advance', false);

      expect(result).to.equal(false);
    });

    it('should log if explicitly passed a true value and a nonallowed screen', () => {
      const result = shouldAuditLog('RandomScreen', true);

      expect(result).to.equal(true);
    });

    it('should log if explicitly passed a true value and an allowed screen', () => {
      const result = shouldAuditLog('Advance', true);

      expect(result).to.equal(true);
    });

    it('should not log if passed an undefined value and a nonallowed screen', () => {
      const result = shouldAuditLog('RandomScreen', undefined);

      expect(result).to.equal(false);
    });

    it('should not log if passed an null value and a nonallowed screen', () => {
      const result = shouldAuditLog('RandomScreen', null);

      expect(result).to.equal(false);
    });

    it('should log if passed an undefined value and an allowed screen', () => {
      const result = shouldAuditLog('AdvanceAmount', undefined);

      expect(result).to.equal(true);
    });

    it('should log if passed an null value and an allowed screen', () => {
      const result = shouldAuditLog('AdvanceAmount', null);

      expect(result).to.equal(true);
    });
  });
});
