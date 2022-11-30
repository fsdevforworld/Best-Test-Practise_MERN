import { AdvanceExperimentLog } from '../../src/models';

export default function(factory: any) {
  factory.define('advance-experiment-log', AdvanceExperimentLog, {
    userId: factory.assoc('user', 'id'),
    bankAccountId: factory.assoc('bank-account', 'id'),
    advanceId: factory.assoc('advance', 'id'),
    advanceApprovalId: factory.assoc('advance-approval', 'id'),
    advanceExperimentId: factory.assoc('advance-experiment', 'id'),
  });
}
