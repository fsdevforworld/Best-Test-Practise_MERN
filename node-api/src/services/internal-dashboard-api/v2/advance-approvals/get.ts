import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { AdvanceApproval, AdvanceNodeLog, AdvanceRuleLog, BankAccount } from '../../../../models';
import {
  advanceApprovalSerializers,
  bankAccountSerializers,
  recurringTransactionSerializers,
  serializeMany,
} from '../../serializers';
import * as Bluebird from 'bluebird';

type Included =
  | advanceApprovalSerializers.IAdvanceNodeLogResource
  | advanceApprovalSerializers.IAdvanceRuleLogResource
  | recurringTransactionSerializers.IRecurringTransactionResource
  | bankAccountSerializers.IBankAccountResource;

async function get(
  req: IDashboardApiResourceRequest<AdvanceApproval>,
  res: IDashboardV2Response<advanceApprovalSerializers.IAdvanceApprovalResource, Included>,
) {
  const approval = req.resource;

  const [advanceNodeLogs, advanceRuleLogs, recurringTransaction, bankAccount] = await Promise.all([
    AdvanceNodeLog.findAll({ where: { advanceApprovalId: approval.id } }),
    AdvanceRuleLog.findByAdvanceApprovalId(approval.id),
    approval.getRecurringTransaction({ paranoid: false }),
    BankAccount.findByPk(approval.bankAccountId, { paranoid: false }),
  ]);

  const [
    serializedRuleLogs,
    serializedRecurringTransaction,
    serializedBankAccount,
  ] = await Promise.all([
    serializeMany(advanceRuleLogs, advanceApprovalSerializers.serializeAdvanceRuleLog),
    recurringTransaction
      ? recurringTransactionSerializers.serializeRecurringTransaction(recurringTransaction)
      : null,
    bankAccountSerializers.serializeBankAccount(bankAccount),
  ]);

  const serializedNodeLogs = await Bluebird.map(advanceNodeLogs, nodeLog => {
    const ruleLogs = serializedRuleLogs.filter(
      ruleLog => ruleLog.attributes.nodeName === nodeLog.name,
    );

    return advanceApprovalSerializers.serializeAdvanceNodeLog(nodeLog, {
      advanceRuleLogs: ruleLogs,
      advanceApproval: { type: 'advance-approval', id: approval.id.toString() },
    });
  });

  const included: Included[] = [
    ...serializedNodeLogs,
    ...serializedRuleLogs,
    serializedBankAccount,
  ];

  if (serializedRecurringTransaction) {
    included.push(serializedRecurringTransaction);
  }

  const data = await advanceApprovalSerializers.serializeAdvanceApproval(approval, {
    user: { type: 'user', id: approval.userId.toString() },
    bankAccount: { type: 'bank-account', id: approval.bankAccountId.toString() },
    advanceNodeLogs: serializedNodeLogs,
    advanceRuleLogs: serializedRuleLogs,
    recurringTransaction: serializedRecurringTransaction,
  });

  const response = {
    data,
    included,
  };

  return res.send(response);
}

export default get;
