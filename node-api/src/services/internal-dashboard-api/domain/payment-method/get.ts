import { BankAccount } from '../../../../models';
import loomisClient, {
  PaymentMethod,
  parsePaymentMethod,
  PaymentMethodType,
} from '@dave-inc/loomis-client';
import { parseLoomisGetPaymentMethod } from '../../../../services/loomis-api/helper';
import { InvalidParametersError } from '@dave-inc/error-types';

async function get(paymentMethodUniversalId: string): Promise<PaymentMethod | BankAccount | null> {
  const { id, type } = parsePaymentMethod(paymentMethodUniversalId);

  if (!type || !id) {
    throw new InvalidParametersError('universalId is not formatted correctly');
  }

  const notInLoomis = [PaymentMethodType.BANK_ACCOUNT, PaymentMethodType.DAVE_BANKING].includes(
    type,
  );

  if (notInLoomis) {
    return BankAccount.findOne({
      where: {
        id,
      },
      paranoid: false,
    });
  } else if (type === PaymentMethodType.DEBIT_CARD) {
    const loomisResponse = await loomisClient.getPaymentMethod({
      universalId: paymentMethodUniversalId,
      includeSoftDeleted: true,
    });

    return parseLoomisGetPaymentMethod(loomisResponse, __filename);
  }

  return null;
}

export default get;
