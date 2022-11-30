import { OAuth2Client } from 'google-auth-library';
import * as config from 'config';

const clientId = config.get<string>('internalDashboardApi.oauth2ClientId');
const client = new OAuth2Client(clientId);

export { clientId };
export default client;
