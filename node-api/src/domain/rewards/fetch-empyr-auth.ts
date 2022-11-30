import * as request from 'superagent';
import * as config from 'config';
import redisClient from '../../lib/redis';
import { ISuperAgentAgent, EmpyrAuth, EmpyrConfig } from '../../typings';
import getEmpyrUserToken from './get-empyr-user-token';

const agent = request.agent() as ISuperAgentAgent<request.SuperAgentRequest>;
const empyrConfig: EmpyrConfig = config.get('empyr');

/** Check API integration guidebook here for details:
 * https://drive.google.com/a/dave.com/file/d/1Dpm0JY6pzE28ixEwybRSSzPF9pUfTg7k/view?usp=sharing
 */
export default async function fetchEmpyrAuth(userId: number): Promise<EmpyrAuth> {
  const cacheKey = `empyrAccessToken:${userId}`;
  const token: any = await redisClient.getAsync(cacheKey);

  if (token) {
    return JSON.parse(token);
  }

  const url: string = `${empyrConfig.url}oauth/token`;
  const userToken: string = getEmpyrUserToken(userId);

  const result = await agent
    .get(url)
    .set('Accept', 'application/json')
    .query({
      grant_type: 'client_usertoken',
      client_id: empyrConfig.clientId,
      client_secret: empyrConfig.clientSecret,
      user_token: userToken,
    })
    .retry()
    .send();

  const payload: EmpyrAuth = {
    clientId: empyrConfig.clientId,
    accessToken: result.body.access_token,
    userToken,
  };

  await redisClient.setexAsync(cacheKey, result.body.expires_in - 5, JSON.stringify(payload));

  return payload;
}
