import * as openapi from '@dave-inc/banking-internal-api-client';
import * as Config from 'config';

export default function getClient(): openapi.V1Api {
  const config = new openapi.Configuration({
    apiKey: Config.get('dave.bankOfDaveInternalApi.secret'),
  });

  return new openapi.V1Api(config, Config.get('dave.bankOfDaveInternalApi.url'));
}
