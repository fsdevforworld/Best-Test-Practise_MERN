import { BankAccount } from '../../../../models';
import { serializeDate } from '../../../../serialization';

import { IApiResourceObject, IApiToOneRelationshipObject } from '../../../../typings';
import serializeRelationships from '../serialize-relationships';
import serialize from '../serialize';
import { encodePaymentMethodId, PaymentMethodType } from '@dave-inc/loomis-client';

interface IBankAccountResource extends IApiResourceObject {
  type: 'bank-account';
  attributes: {
    available: number;
    isDefaultForUser: boolean;
    created: string;
    current: number;
    deleted: string;
    displayName: string;
    lastFour: string;
    subtype: string;
    type: string;
    externalId: string;
    synapseNodeId: string;
    updated: string;
  };
}

const serializeBankAccount: serialize<BankAccount, IBankAccountResource> = async (
  bankAccount,
  relationships,
) => {
  const user = bankAccount.user || (await bankAccount.getUser({ paranoid: false }));
  const isDefaultForUser = user?.defaultBankAccountId === bankAccount.id;
  const { defaultPaymentMethodId } = bankAccount;

  let primaryPaymentMethod: IApiToOneRelationshipObject;

  if (!defaultPaymentMethodId) {
    primaryPaymentMethod = { data: null };
  } else {
    const id = encodePaymentMethodId({
      type: PaymentMethodType.DEBIT_CARD,
      id: defaultPaymentMethodId,
    });

    primaryPaymentMethod = { data: { type: 'payment-method', id } };
  }

  return {
    type: 'bank-account',
    id: `${bankAccount.id}`,
    attributes: {
      available: bankAccount.available,
      created: serializeDate(bankAccount.created),
      current: bankAccount.current,
      deleted: serializeDate(bankAccount.deleted),
      displayName: bankAccount.displayName,
      externalId: bankAccount.externalId,
      isDefaultForUser,
      lastFour: bankAccount.lastFour,
      microDeposit: bankAccount.microDeposit,
      microDepositCreated: serializeDate(bankAccount.microDepositCreated),
      subtype: bankAccount.subtype,
      synapseNodeId: bankAccount.synapseNodeId,
      type: bankAccount.type,
      updated: serializeDate(bankAccount.updated),
    },
    relationships: {
      primaryPaymentMethod,
      ...serializeRelationships(relationships),
    },
  };
};

export { IBankAccountResource };
export default serializeBankAccount;
