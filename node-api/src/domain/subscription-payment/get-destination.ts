import loomisClient, {
  PaymentMethod,
  PaymentMethodId,
  PaymentMethodType,
} from '@dave-inc/loomis-client';
import { SubscriptionPayment, BankAccount } from '../../models';
import { InvalidParametersError } from '../../lib/error';
import { parseLoomisGetPaymentMethod } from '../../services/loomis-api/helper';

async function getDestination(
  subscriptionPayment: SubscriptionPayment,
  destinationId?: PaymentMethodId,
): Promise<PaymentMethod | BankAccount> {
  let type = destinationId?.type;
  let id = destinationId?.id;
  const { paymentMethodId, bankAccountId } = subscriptionPayment;

  if (!destinationId && paymentMethodId) {
    type = PaymentMethodType.DEBIT_CARD;
    id = paymentMethodId;
  } else if (!destinationId) {
    type = PaymentMethodType.BANK_ACCOUNT;
    id = bankAccountId;
  }

  if (type === PaymentMethodType.BANK_ACCOUNT) {
    return BankAccount.findOne({
      where: {
        userId: subscriptionPayment.userId,
        id,
      },
      paranoid: false,
    });
  }

  if (type === PaymentMethodType.DEBIT_CARD) {
    const loomisReponse = await loomisClient.getPaymentMethod({
      id: subscriptionPayment.paymentMethodId,
      includeSoftDeleted: true,
    });
    return parseLoomisGetPaymentMethod(loomisReponse, __filename);
  }

  throw new InvalidParametersError('destination type must be either bankAccount or debitCard');
}

export default getDestination;
