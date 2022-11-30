import * as openapi from '@dave-inc/identity-api-client';
import * as Config from 'config';

const { clientId, clientSecret, basePath } = Config.get<{
  clientId: string;
  clientSecret: string;
  basePath: string;
}>('identityApi');

export default function getClient(): openapi.IdentityApi {
  const config = new openapi.Configuration({
    username: clientId,
    password: clientSecret,
  });

  return new openapi.IdentityApi(config, basePath);
}
