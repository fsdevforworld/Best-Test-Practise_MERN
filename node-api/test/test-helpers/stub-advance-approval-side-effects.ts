import * as sinon from 'sinon';
import TermsAndRequestLimiter from '../../src/services/advance-approval/advance-approval-engine/limiters/counter-limiter';

export default function stubAdvanceApprovalSideEffects(sandbox: sinon.SinonSandbox) {
  return sandbox.stub(TermsAndRequestLimiter.prototype, 'experimentIsAllowed').resolves(false);
}
