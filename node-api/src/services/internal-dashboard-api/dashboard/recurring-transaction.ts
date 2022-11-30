import * as moment from 'moment';
import * as RecurringTransactionDomain from '../../../domain/recurring-transaction';
import { RecurringTransaction } from '../../../domain/recurring-transaction';
import { getParams } from '../../../lib/utils';
import { IDashboardApiRequest, IDaveResponse } from '../../../typings';
import { Response } from 'express';
import { StandardResponse } from '@dave-inc/wire-typings';
import { serializeDate } from '../../../serialization';

function formatDashboardResponse(recurringTransaction: RecurringTransaction) {
  return {
    ...recurringTransaction,
    interval: recurringTransaction.rsched.interval,
    params: recurringTransaction.rsched.params,
    rollDirection: recurringTransaction.rsched.rollDirection,
    dtstart: recurringTransaction.rsched.weeklyStart,
  };
}

async function getByUserId(req: IDashboardApiRequest, res: Response): Promise<Response> {
  const userId = parseInt(req.params.userId, 10);

  const transactions = await RecurringTransactionDomain.getByUser(userId);
  return res.send(transactions.map(formatDashboardResponse));
}

async function create(req: IDashboardApiRequest, res: Response): Promise<Response> {
  const userId = parseInt(req.params.userId, 10);
  const adminId = req.internalUser.id;

  const params = getParams(
    req.body,
    ['interval', 'params'],
    [
      'userAmount',
      'userDisplayName',
      'skipValidityCheck',
      'bankAccountId',
      'bankTransactionId',
      'rollDirection',
    ],
  );

  if (!params.skipValidityCheck) {
    params.skipValidityCheck = true;
  }

  params.userId = userId;

  const recurringTransaction = await RecurringTransactionDomain.adminCreate(
    userId,
    adminId,
    params,
  );

  return res.send(formatDashboardResponse(recurringTransaction));
}

async function update(req: IDashboardApiRequest, res: Response): Promise<Response> {
  const recurringTransactionId = req.params.recurringTransactionId;
  const adminId = req.internalUser.id;

  const result = await RecurringTransactionDomain.adminUpdate(
    recurringTransactionId,
    adminId,
    req.body,
  );

  return res.send(formatDashboardResponse(result));
}

async function deleteById(
  req: IDashboardApiRequest,
  res: IDaveResponse<StandardResponse>,
): Promise<Response> {
  const recurringTransactionId = parseInt(req.params.recurringTransactionId, 10);
  const adminId = req.internalUser.id;

  await RecurringTransactionDomain.adminDelete(recurringTransactionId, adminId);
  return res.send({ ok: true });
}

async function getExpectedTransactions(
  req: IDashboardApiRequest,
  res: Response,
): Promise<Response> {
  const recurringTransactionId = req.params.recurringTransactionId;
  const startDate = moment().subtract(2, 'months');

  const expectedTransactions = await RecurringTransactionDomain.getExpectedByRecurringTransactionId(
    parseInt(recurringTransactionId, 10),
    startDate,
  );

  return res.send(expectedTransactions.map(serializeExpectedTransaction));
}

function serializeExpectedTransaction(
  expectedTransaction: RecurringTransactionDomain.ExpectedTransaction,
) {
  return {
    ...expectedTransaction,
    expectedDate: serializeDate(expectedTransaction.expectedDate, 'YYYY-MM-DD'),
    settledDate: serializeDate(expectedTransaction.settledDate, 'YYYY-MM-DD'),
    pendingDate: serializeDate(expectedTransaction.pendingDate, 'YYYY-MM-DD'),
    created: serializeDate(expectedTransaction.created),
    updated: serializeDate(expectedTransaction.updated),
  };
}

export default {
  create,
  deleteById,
  getExpectedTransactions,
  getByUserId,
  update,
};
