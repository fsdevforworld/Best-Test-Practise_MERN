import { PaymentMethodType } from '@dave-inc/loomis-client';
import { serializeDate } from '../../../../serialization';
import { BankAccount } from '../../../../models';
import serialize from '../serialize';
import IPaymentMethodResource from './i-payment-method-resource';

const serializer: serialize<
  BankAccount,
  IPaymentMethodResource
> = async function serializeBankAccount(bankAccount) {
  const bankConnection = await bankAccount.getBankConnection({ paranoid: false });
  const isDaveBanking = bankConnection.isDaveBanking();
  const type = isDaveBanking ? 'DAVE' : 'BANK';

  return {
    id: `${type}:${bankAccount.id}`,
    type: 'payment-method',
    attributes: {
      created: serializeDate(bankAccount.created),
      deleted: serializeDate(bankAccount.deleted),
      displayName: bankAccount.displayName,
      invalid: null,
      type: PaymentMethodType.BANK_ACCOUNT,
    },
  };
};

export default serializer;
