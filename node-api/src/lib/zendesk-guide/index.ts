import * as config from 'config';
import Client from './client';

const overdraftBaseUrl = config.get<string>('zendesk.guide.overdraftUrl');
const bankingBaseUrl = config.get<string>('zendesk.guide.bankingUrl');

const bankingClient = new Client(bankingBaseUrl);
const overdraftClient = new Client(overdraftBaseUrl);

export { bankingClient, overdraftClient };
