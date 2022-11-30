import loomisClient, { PaymentMethod } from '@dave-inc/loomis-client';

async function getAllForUser(userId: number): Promise<PaymentMethod[]> {
  const loomisResponse = await loomisClient.getPaymentMethods(userId, {
    includeBankAccounts: true,
    includeSoftDeleted: true,
  });

  if ('error' in loomisResponse) {
    throw loomisResponse.error;
  }

  return loomisResponse.data;
}

export default getAllForUser;
