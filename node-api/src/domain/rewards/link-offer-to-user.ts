import * as request from 'superagent';
import * as config from 'config';
import fetchEmpyrAuth from './fetch-empyr-auth';
import { EmpyrConfig, ISuperAgentAgent } from '../../typings';

const agent = request.agent() as ISuperAgentAgent<request.SuperAgentRequest>;
const empyrConfig: EmpyrConfig = config.get('empyr');

const url: string = `${empyrConfig.url}api/v2/users/offers/link`;

export default async function linkOfferToUser(offerId: number, userId: number) {
  const auth = await fetchEmpyrAuth(userId);

  return agent
    .post(url)
    .set('Accept', 'application/json')
    .query({ client_id: empyrConfig.clientId })
    .field('access_token', auth.accessToken)
    .field('offer', offerId);
}
