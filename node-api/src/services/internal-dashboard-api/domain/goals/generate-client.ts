import { Configuration, GoalsApi } from '@dave-inc/banking-goals-internal-api-client';
import * as config from 'config';

const password = config.get<string>('goalsApi.secret');
const basePath = config.get<string>('goalsApi.basePath');

function generateClient(userId: number): GoalsApi {
  const openApiConfig = new Configuration({
    username: `${userId}`,
    password,
  });

  const client = new GoalsApi(openApiConfig, basePath);

  return client;
}

export default generateClient;
