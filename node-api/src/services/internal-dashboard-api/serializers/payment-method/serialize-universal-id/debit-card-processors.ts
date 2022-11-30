import { ExternalTransactionProcessor } from '@dave-inc/wire-typings';
import { ReimbursementExternalProcessor } from '../../../../../models/reimbursement';

const debitCardProcessors = [
  ExternalTransactionProcessor.Blastpay,
  ExternalTransactionProcessor.Payfi,
  ExternalTransactionProcessor.Risepay,
  ExternalTransactionProcessor.Tabapay,
  ReimbursementExternalProcessor.Blastpay,
  ReimbursementExternalProcessor.Payfi,
  ReimbursementExternalProcessor.Tabapay,
  ReimbursementExternalProcessor.Risepay,
];

Object.freeze(debitCardProcessors);

export default debitCardProcessors;
