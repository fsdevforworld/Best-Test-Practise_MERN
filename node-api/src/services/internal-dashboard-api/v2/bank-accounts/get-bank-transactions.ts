import { QueryFilter, SortOrder } from '@dave-inc/heath-client';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { BankAccount } from '../../../../models';
import { bankAccountSerializers, serializeMany } from '../../serializers';
import heathClient from '../../../../lib/heath-client';

function buildFilters(query: any): QueryFilter {
  const filters: QueryFilter = {};

  const startDate = query.filter?.startDate;
  if (startDate) {
    filters.transactionDate = {
      gte: startDate,
    };
  }

  const endDate = query.filter?.endDate;
  if (endDate) {
    filters.transactionDate = Object.assign({}, filters.transactionDate, { lte: endDate });
  }

  const displayName = query.filter?.displayName;
  if (displayName) {
    filters.displayName = { like: `%${displayName}%` };
  }

  const minAmount = query.filter?.minAmount;
  if (minAmount) {
    filters.amount = {
      gte: minAmount,
    };
  }

  const maxAmount = query.filter?.maxAmount;
  if (maxAmount) {
    filters.amount = Object.assign({}, filters.amount, { lte: maxAmount });
  }

  const or = query.filter?.or;
  if (or) {
    filters.or = or;
  }

  return filters;
}

async function getBankTransactions(
  req: IDashboardApiResourceRequest<BankAccount>,
  res: IDashboardV2Response<bankAccountSerializers.IBankTransactionResource[]>,
) {
  const { resource: bankAccount, query } = req;

  const filters = buildFilters(query);

  const transactions = await heathClient.getBankTransactions(bankAccount.id, filters, {
    order: {
      transactionDate: SortOrder.DESC,
    },
    limit: parseInt(query.page?.limit, 10) || 200,
    offset: parseInt(query.page?.offset, 10) || 0,
  });

  const data = await serializeMany(transactions, bankAccountSerializers.serializeBankTransaction);

  res.send({
    data,
  });
}

export default getBankTransactions;
