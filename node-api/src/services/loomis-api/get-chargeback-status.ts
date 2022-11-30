import { PaymentProviderTransactionType } from '@dave-inc/loomis-client';
import { InvalidParametersError, NotFoundError } from '../../lib/error';
import { Request, Response } from 'express';
import { QueryTypes } from 'sequelize';
import { sequelize, User } from '../../models';
import { TransactionSettlementStatus } from '@dave-inc/wire-typings';
import { TransactionSettlementSource } from '../../typings';

type TableParam = 'payment' | 'subscription_payment';
async function getCharges(userId: number) {
  const buildQuery = (table: TableParam) => `
    select ts.id as settlementId,
    ts.external_id as externalId,
    p.reference_id as referenceId,
    ? as paymentProviderTransactionType,
    p.external_processor as externalProcessor
    from
      transaction_settlement as ts
      inner join ${table} p on (
        p.id = ts.source_id
        and p.deleted is null
        and p.user_id = ?
        and ts.source_type = ?
      )
    where ts.status in (?, ?) or ts.representment_start is not null
  `;

  const replacements = (table: TableParam) => {
    return [
      table === 'payment'
        ? PaymentProviderTransactionType.AdvancePayment
        : PaymentProviderTransactionType.SubscriptionPayment,
      userId,
      table === 'payment'
        ? TransactionSettlementSource.Payment
        : TransactionSettlementSource.SubscriptionPayment,
      TransactionSettlementStatus.Chargeback,
      TransactionSettlementStatus.Representment,
    ];
  };

  const userExists = (await User.count({ where: { id: userId } })) === 1;
  if (!userExists) {
    throw new NotFoundError('User not found');
  }

  const paymentSettlements = await sequelize.query(buildQuery('payment'), {
    replacements: replacements('payment'),
    type: QueryTypes.SELECT,
  });

  const subscriptionSettlements = await sequelize.query(buildQuery('subscription_payment'), {
    replacements: replacements('subscription_payment'),
    type: QueryTypes.SELECT,
  });

  return [...paymentSettlements, ...subscriptionSettlements];
}
export default async function getChargebackStatus(req: Request, res: Response) {
  const { userId } = req.query;

  if (!userId) {
    throw new InvalidParametersError('Must pass userId');
  }

  const parsedUserId = parseInt(userId, 10);
  if (isNaN(parsedUserId)) {
    throw new InvalidParametersError('Must pass a valid user Id');
  }

  const charges = await getCharges(parsedUserId);
  return res.send({
    userIsFraudulent: charges.length > 0,
    charges,
  });
}
