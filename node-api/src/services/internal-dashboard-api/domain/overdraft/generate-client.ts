import { Configuration, OverdraftApi } from '@dave-inc/overdraft-internal-client';
import * as config from 'config';

const apiKey = config.get<string>('overdraftApi.secret');
const basePath = config.get<string>('overdraftApi.basePath');

function generateClient(): OverdraftApi {
  const openApiConfig = new Configuration({ apiKey });

  const client = new OverdraftApi(openApiConfig, basePath);

  return client;
}

export default generateClient;
