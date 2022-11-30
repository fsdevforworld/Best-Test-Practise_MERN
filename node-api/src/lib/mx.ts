import * as config from 'config';
import { AtriumClient } from 'mx-atrium/atrium';

const client = new AtriumClient(
  config.get('mxAtrium.apiKey'),
  config.get('mxAtrium.clientId'),
  config.get('mxAtrium.baseUrl'),
);

export default client;
