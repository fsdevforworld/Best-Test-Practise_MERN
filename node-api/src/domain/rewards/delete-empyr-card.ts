import * as request from 'superagent';
import * as config from 'config';
import { EmpyrConfig, ISuperAgentAgent } from '../../typings';
import { User, PaymentMethod } from '../../models';
import { retry } from '../../lib/utils';
import { NotFoundError } from '../../lib/error';
import fetchEmpyrAuth from './fetch-empyr-auth';
import loomisClient from '@dave-inc/loomis-client';

const agent = request.agent() as ISuperAgentAgent<request.SuperAgentRequest>;
const empyrConfig: EmpyrConfig = config.get('empyr');

async function validateAndFetchPaymentMethod(paymentMethodId: number, userId: number) {
  const paymentMethod = await PaymentMethod.findOne({
    where: {
      id: paymentMethodId,
      userId,
    },
  });

  if (!paymentMethod) {
    throw new NotFoundError(
      `Payment method with id ${paymentMethodId} belonging to user ${userId} not found`,
    );
  }

  return paymentMethod;
}

export default async function deleteEmpyrCard(user: User, paymentMethodId: number) {
  // Check that the payment method exists and belongs to the user
  const paymentMethod = await validateAndFetchPaymentMethod(paymentMethodId, user.id);

  const auth = await fetchEmpyrAuth(user.id);
  const url: string = `${empyrConfig.url}api/v2/cards/${paymentMethod.empyrCardId}/delete`;

  await retry(
    () =>
      agent
        .post(url)
        .set('Accept', 'application/json')
        .query({ client_id: empyrConfig.clientId })
        .field('access_token', auth.accessToken),
    3,
  );

  // We don't clear out the empyr card id as there could be existing transactions that need to authorize/settle
  const loomisResponse = await loomisClient.updatePaymentMethod(paymentMethod.id, {
    optedIntoDaveRewards: false,
  });

  if ('error' in loomisResponse) {
    throw loomisResponse.error;
  }
}
