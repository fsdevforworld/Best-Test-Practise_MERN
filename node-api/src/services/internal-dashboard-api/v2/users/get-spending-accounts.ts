import { User } from '../../../../models';
import {
  IApiRelationshipData,
  IDashboardApiResourceRequest,
  IDashboardV2Response,
} from '../../../../typings';
import { serializeMany, daveBankingSerializer } from '../../serializers';
import getClient from '../../../../../src/domain/bank-of-dave-internal-api';
import { ApiAccountType } from '@dave-inc/banking-internal-api-client';

const BankingInternalApiClient = getClient();

async function getSpendingAccounts(
  req: IDashboardApiResourceRequest<User>,
  res: IDashboardV2Response<
    daveBankingSerializer.ISpendingAccountResource[],
    daveBankingSerializer.IDaveBankingCardResource | daveBankingSerializer.IDaveBankingBanResource
  >,
) {
  const { id: userId } = req.resource;

  const {
    data: { bankAccounts, cards, userBanned },
  } = await BankingInternalApiClient.getUser(userId);

  const spendingAccounts = bankAccounts.filter(
    bankAccount => bankAccount.accountType === ApiAccountType.Checking,
  );
  const spendingAccountIds = spendingAccounts.map(spendingAccount => spendingAccount.id);
  const spendingAccountCards = cards.filter(card =>
    spendingAccountIds.includes(card.bankAccountId),
  );

  const serializedSpendingCards = await serializeMany(
    spendingAccountCards,
    daveBankingSerializer.serializeSpendingCard,
  );

  const serializedSpendingAccounts = await Promise.all(
    spendingAccounts.map(spendingAccount => {
      const associatedCards = serializedSpendingCards.find(
        card =>
          (card.relationships.bankAccount.data as IApiRelationshipData).id === spendingAccount.id,
      );

      return daveBankingSerializer.serializeSpendingAccount(spendingAccount, {
        cards: associatedCards,
      });
    }),
  );

  const bannedStatus = userBanned
    ? [daveBankingSerializer.serializeDaveBankingBan(userBanned, { userId })]
    : [];

  const response = {
    data: serializedSpendingAccounts,
    included: [...serializedSpendingCards, ...bannedStatus],
  };

  return res.send(response);
}

export default getSpendingAccounts;
