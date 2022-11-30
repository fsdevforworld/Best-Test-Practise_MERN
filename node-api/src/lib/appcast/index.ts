import * as config from 'config';
import Client from './client';

const APPCAST_APIKEY = config.get<string>('appcast.apiKey');
const APPCAST_BASEURL = config.get<string>('appcast.baseUrl');

export { AppcastJob } from './types';
export default new Client({
  apiKey: APPCAST_APIKEY,
  baseUrl: APPCAST_BASEURL,
});
