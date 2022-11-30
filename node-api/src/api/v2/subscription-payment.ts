import { SubscriptionBilling, BankAccount, BankConnection } from '../../models';
import { InvalidParametersError, NotFoundError } from '../../lib/error';
import { IDaveRequest, IDaveResponse } from '../../typings';
import { BankingDataSource } from '@dave-inc/wire-typings';
import loomisClient from '@dave-inc/loomis-client';
import { parseLoomisGetPaymentMethod } from '../../services/loomis-api/helper';
import * as Collection from '../../domain/collection';
import { NotFoundMessageKey } from '../../translations';
import { SubscriptionChargeType } from '../../domain/collection';

async function create(
  req: IDaveRequest,
  res: IDaveResponse<{ subscriptionPaymentId: number }>,
): Promise<void> {
  try {
    const { subscriptionBillingId, paymentMethodId } = req.body;

    if (!subscriptionBillingId) {
      throw new InvalidParametersError(null, {
        required: ['subscriptionBillingId'],
        provided: req.body,
      });
    }

    const [subscriptionBilling, bankAccount] = await Promise.all([
      SubscriptionBilling.findOne({
        where: {
          id: subscriptionBillingId,
          userId: req.user.id,
        },
      }),
      BankAccount.findByPk(req.user.defaultBankAccountId, {
        include: [BankConnection],
      }),
    ]);

    if (subscriptionBilling === null) {
      throw new NotFoundError(NotFoundMessageKey.SubscriptionBillingNotFound);
    }

    let charge;
    let chargeType: SubscriptionChargeType;
    if (
      bankAccount &&
      bankAccount.bankConnection.bankingDataSource === BankingDataSource.BankOfDave
    ) {
      charge = await Collection.createBankAccountSubscriptionCharge(bankAccount);
      chargeType = SubscriptionChargeType.BankChargeOnly;
    } else {
      if (!paymentMethodId) {
        throw new InvalidParametersError(null, {
          required: ['subscriptionBillingId', 'paymentMethodId'],
          provided: req.body,
        });
      }

      const loomisResponse = await loomisClient.getPaymentMethod({
        id: paymentMethodId,
        userId: req.user.id,
      });
      const debitCard = parseLoomisGetPaymentMethod(loomisResponse, __filename);

      if (debitCard === null) {
        throw new NotFoundError(NotFoundMessageKey.DebitCardNotFound);
      }

      charge = Collection.createDebitCardSubscriptionCharge(debitCard);
      chargeType = SubscriptionChargeType.DebitChargeOnly;
    }

    const subscriptionCollectionAttempt = await Collection.collectSubscription(
      subscriptionBilling,
      charge,
      chargeType,
      'user',
    );

    if (!subscriptionCollectionAttempt.successful()) {
      throw subscriptionCollectionAttempt.extra.err;
    }

    res.status(201).send({
      subscriptionPaymentId: subscriptionCollectionAttempt.subscriptionPaymentId,
    });
  } catch (ex) {
    throw ex;
  }
}

export default { create };
