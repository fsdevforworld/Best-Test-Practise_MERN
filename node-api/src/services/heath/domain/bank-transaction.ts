import {
  BankTransaction as DBBankTransaction,
  MerchantInfo as DBMerchantInfo,
} from '../../../models';
import { dogstatsd } from '../../../lib/datadog-statsd';
import { Op, WhereOptions } from 'sequelize';
import { serializeDate } from '../../../serialization';
import { getMerchantInfoForBankTransaction } from './merchant-info';
import { bulkInsertAndRetry } from '../../../lib/sequelize-helpers';
import { SequelizeOperator } from './types';
import { isArray, isNil, isObject, map, orderBy } from 'lodash';
import {
  BankTransaction,
  BankTransactionCreate,
  BankTransactionStatus,
  Compares,
  OptionsOrDirectCompare,
  QueryFilter,
  QueryOptions,
  SortOrder,
} from '@dave-inc/heath-client';
import * as moment from 'moment';
import { isMoment, Moment } from 'moment';
import * as Bluebird from 'bluebird';

export async function createBankTransactions(bankTransactions: BankTransactionCreate[]) {
  const transactions = await bulkInsertAndRetry(DBBankTransaction, bankTransactions);
  return Bluebird.map(transactions, formatBankTransaction);
}

export async function countBankTransactions(
  bankAccountId: number,
  { useReadReplica = false }: { useReadReplica?: boolean } = {},
) {
  return DBBankTransaction.unscoped().count({
    where: {
      bankAccountId,
    },
    useMaster: !useReadReplica,
  });
}

export async function getSingleBankTransaction(
  bankAccountId: number,
  filters: QueryFilter,
  options: QueryOptions = {},
): Promise<BankTransaction> {
  const [bankTransaction] = await getBankTransactions(bankAccountId, filters, {
    ...options,
    limit: 1,
  });
  return bankTransaction;
}

function isDateComparison(transactionDate: any): transactionDate is Compares<string> {
  return (
    transactionDate &&
    typeof transactionDate === 'object' &&
    ('gte' in transactionDate || 'gt' in transactionDate)
  );
}

export async function getBankTransactions(
  bankAccountId: number | number[],
  filter: QueryFilter = {},
  options: QueryOptions = {},
): Promise<BankTransaction[]> {
  const { limit, offset, useReadReplica = false } = options;
  const where: WhereOptions = {
    bankAccountId,
    ...getBankTransactionWhereOptions(filter),
  };

  if (isDateComparison(filter.transactionDate)) {
    const start = filter.transactionDate.gte || filter.transactionDate.gt;
    const daysAgo = moment().diff(start, 'days');
    dogstatsd.histogram('query_bank_transactions.query.days_ago', daysAgo);
  }

  const transactions = await DBBankTransaction.unscoped().findAll({
    where,
    order: getSortOrder(options),
    include: [DBMerchantInfo],
    limit,
    offset,
    useMaster: !useReadReplica,
  });

  let formattedTransactions;
  formattedTransactions = await Bluebird.map(transactions, formatBankTransaction);
  if (!options.order) {
    formattedTransactions = orderBy(formattedTransactions, 'transactionDate', 'desc');
  }

  if (formattedTransactions.length > 0) {
    if (options.order === 'transactionDate') {
      const start = formattedTransactions[0].transactionDate;
      const daysAgo = moment().diff(start, 'days');
      dogstatsd.histogram('query_bank_transactions.result.days_ago', daysAgo);
    } else {
      const orderedByDate = orderBy(formattedTransactions, 'transactionDate', 'desc');
      const start = orderedByDate[0].transactionDate;
      const daysAgo = moment().diff(start, 'days');
      dogstatsd.histogram('query_bank_transactions.result.days_ago', daysAgo);
    }
  }

  return formattedTransactions;
}

function getSortOrder(options: QueryOptions): Array<[string, SortOrder]> {
  if (options.limit || options.order) {
    const { order = { transactionDate: SortOrder.DESC } } = options;
    return map(order, (direction, field) => {
      if (field === 'status') {
        return ['pending', direction];
      }

      return [field, direction];
    });
  } else {
    return null;
  }
}

function getBankTransactionWhereOptions({
  id,
  transactionDate,
  amount,
  displayName,
  pending,
  status,
  or,
}: QueryFilter): WhereOptions {
  let where: WhereOptions = {};

  const transactionDateOptions = getWhereOptions(convertPossibleMomentTypes(transactionDate));
  if (transactionDateOptions) {
    where.transactionDate = transactionDateOptions;
  }

  const amountOption = getWhereOptions(amount);
  if (amountOption) {
    where.amount = amountOption;
  }

  const displayNameOption = getWhereOptions(displayName);
  if (displayNameOption) {
    where.displayName = displayNameOption;
  }

  if (pending || status === BankTransactionStatus.PENDING) {
    where.pending = true;
  } else if (!!status || pending === false) {
    where.pending = false;
  }

  const idOptions = getWhereOptions(id);
  if (idOptions) {
    where.id = idOptions;
  }

  if (or) {
    where = { ...where, [Op.or]: or.map(o => getBankTransactionWhereOptions(o)) };
  }

  return where;
}

function insertIntoWhere<T>(
  value: T,
  sequelizeOperator: SequelizeOperator,
  whereOptions: WhereOptions,
): WhereOptions {
  if (!isNil(value)) {
    return { ...whereOptions, [sequelizeOperator]: value };
  }

  return whereOptions;
}

function convertPossibleMomentTypes(
  value: OptionsOrDirectCompare<string | Moment>,
): OptionsOrDirectCompare<string> {
  if (Array.isArray(value)) {
    return value.map(v => convertPossibleMomentTypes(v) as string);
  }

  if (isMoment(value)) {
    return value.ymd();
  }

  return value as Compares<string>;
}

function getWhereOptions<T>(options: OptionsOrDirectCompare<T>): WhereOptions | T | T[] | null {
  if (!options) {
    return null;
  }

  if (isArray(options) || !isObject(options)) {
    return options as T | T[];
  }

  options = options as Compares<T>;
  let whereOptions: WhereOptions = getWhereOptionsForRange(options);
  if (whereOptions) {
    return whereOptions;
  }

  whereOptions = getWhereOptionsForInOrOut(options);
  if (whereOptions) {
    return whereOptions;
  }

  whereOptions = getWhereOptionsForLike(options);
  if (whereOptions) {
    return whereOptions;
  }
}

function getWhereOptionsForRange<T>(options: Compares<T>) {
  if (isNil(options.lt) && isNil(options.gt) && isNil(options.gte) && isNil(options.lte)) {
    return;
  }

  let fieldOptions: WhereOptions = {};
  fieldOptions = insertIntoWhere(options.gte, Op.gte, fieldOptions);
  fieldOptions = insertIntoWhere(options.lte, Op.lte, fieldOptions);
  fieldOptions = insertIntoWhere(options.lt, Op.lt, fieldOptions);
  fieldOptions = insertIntoWhere(options.gt, Op.gt, fieldOptions);

  return fieldOptions;
}

function getWhereOptionsForInOrOut<T>(options: Compares<T>) {
  if (!options?.in && !options?.notIn) {
    return;
  }

  let fieldOptions: WhereOptions = {};
  fieldOptions = insertIntoWhere(options.in, Op.in, fieldOptions);
  fieldOptions = insertIntoWhere(options.notIn, Op.notIn, fieldOptions);

  return fieldOptions;
}

function getWhereOptionsForLike<T>(options: Compares<T>) {
  if (isNil(options?.like)) {
    return;
  }

  if (Array.isArray(options.like)) {
    return { [Op.or]: options.like.map(query => ({ [Op.like]: query })) };
  }

  return { [Op.like]: options.like };
}

async function formatBankTransaction(bankTransaction: DBBankTransaction): Promise<BankTransaction> {
  return {
    id: bankTransaction.id,
    bankAccountId: bankTransaction.bankAccountId,
    externalId: bankTransaction.externalId,
    pendingExternalName: bankTransaction.pendingExternalName,
    pendingDisplayName: bankTransaction.pendingDisplayName,
    externalName: bankTransaction.externalName,
    displayName: bankTransaction.displayName,
    amount: bankTransaction.amount,
    cents: Math.round(bankTransaction.amount * 100),
    pending: bankTransaction.pending,
    address: bankTransaction.address,
    city: bankTransaction.city,
    state: bankTransaction.state,
    zipCode: bankTransaction.zipCode,
    plaidCategory: bankTransaction.plaidCategory,
    plaidCategoryId: bankTransaction.plaidCategoryId,
    merchantInfo: await getMerchantInfoForBankTransaction(bankTransaction),
    transactionDate: bankTransaction.transactionDate.ymd(),
    created: serializeDate(bankTransaction.created),
    updated: serializeDate(bankTransaction.updated),
  };
}
