import { Request, Response } from 'express';
import { FindOptions, Includeable, Op } from 'sequelize';
import { PaymentMethod, BankAccount } from '../../models';
import { InvalidParametersError } from '../../lib/error';
import {
  PaymentMethod as LoomisPaymentMethod,
  PaymentMethodType,
  PaymentMethodId,
  parsePaymentMethod,
} from '@dave-inc/loomis-client';
import {
  bankAccountModelToPaymentMethod,
  paymentMethodModelToType,
  SUPPORTED_BANK_ACCOUNT_TYPE,
  SUPPORTED_BANK_ACCOUNT_SUBTYPES,
} from '../../typings';

type GetPaymentMethodsParameters = {
  userId: number;
  paymentMethodIds: PaymentMethodId[];
  queryByPaymentMethodId: boolean;
  includeBankAccounts: boolean;
  includeSoftDeleted: boolean;
};

function parseParameters(req: Request): GetPaymentMethodsParameters {
  const { userId } = req.params;
  let { paymentMethodIds, includeBankAccounts = 'false', includeSoftDeleted = 'false' } = req.query;
  includeBankAccounts = includeBankAccounts !== 'false';
  includeSoftDeleted = includeSoftDeleted !== 'false';

  const parsedUserId = parseInt(userId, 10);
  if (isNaN(parsedUserId)) {
    throw new InvalidParametersError('Must pass a valid user ID');
  }

  if (!!paymentMethodIds && !Array.isArray(paymentMethodIds)) {
    paymentMethodIds = [paymentMethodIds];
  }

  let parsedPaymentMethodIds: PaymentMethodId[] = [];
  if (Array.isArray(paymentMethodIds)) {
    parsedPaymentMethodIds = paymentMethodIds.map(parsePaymentMethod);
  }
  return {
    userId: parsedUserId,
    paymentMethodIds: parsedPaymentMethodIds,
    queryByPaymentMethodId: parsedPaymentMethodIds.length > 0,
    includeBankAccounts,
    includeSoftDeleted,
  };
}

function buildQuery(
  { includeSoftDeleted, queryByPaymentMethodId }: GetPaymentMethodsParameters,
  { paymentMethodIds, userId }: { paymentMethodIds: Array<string | number>; userId: number },
): FindOptions {
  const query: FindOptions = {};

  if (includeSoftDeleted) {
    query.paranoid = false;
  }

  if (queryByPaymentMethodId) {
    query.where = { id: paymentMethodIds };
  } else {
    query.where = { userId };
  }

  return query;
}

async function findDebitCards(params: GetPaymentMethodsParameters): Promise<LoomisPaymentMethod[]> {
  const { userId, includeSoftDeleted, queryByPaymentMethodId } = params;
  const paymentMethodIds = params.paymentMethodIds
    .filter(paymentMethodId => paymentMethodId.type === PaymentMethodType.DEBIT_CARD)
    .map(paymentMethodId => paymentMethodId.id);

  const query = buildQuery(params, { paymentMethodIds, userId });

  if (!queryByPaymentMethodId) {
    const includeBankAccount: Includeable = { model: BankAccount };

    if (includeSoftDeleted) {
      includeBankAccount.paranoid = false;
    }

    query.include = [includeBankAccount];
  }

  const paymentMethods = await PaymentMethod.findAll(query);

  return paymentMethods.map(paymentMethodModelToType);
}

async function findBankAccounts(
  params: GetPaymentMethodsParameters,
): Promise<LoomisPaymentMethod[]> {
  if (!params.includeBankAccounts) {
    return [];
  }

  const { userId } = params;
  const paymentMethodIds = params.paymentMethodIds
    .filter(
      paymentMethodId =>
        paymentMethodId.type === PaymentMethodType.BANK_ACCOUNT ||
        paymentMethodId.type === PaymentMethodType.DAVE_BANKING,
    )
    .map(paymentMethodId => paymentMethodId.id);

  const query = buildQuery(params, { paymentMethodIds, userId });
  query.where = {
    ...query.where,
    type: SUPPORTED_BANK_ACCOUNT_TYPE,
    subtype: { [Op.in]: SUPPORTED_BANK_ACCOUNT_SUBTYPES },
  };

  const paymentMethods = await BankAccount.findAll(query);

  return Promise.all(paymentMethods.map(bankAccountModelToPaymentMethod));
}

export default async function getPaymentMethods(req: Request, res: Response) {
  let params: GetPaymentMethodsParameters;
  try {
    params = parseParameters(req);
  } catch (err) {
    throw new InvalidParametersError(err.message);
  }

  const [debitCards, bankAccounts] = await Promise.all([
    findDebitCards(params),
    findBankAccounts(params),
  ]);

  res.json(debitCards.concat(bankAccounts));
}
