import * as SynapsePay from 'synapsepay';
import Constants from './constants';

const authenticationClient = new SynapsePay.Clients(
  Constants.SYNAPSEPAY_CLIENT_ID,
  Constants.SYNAPSEPAY_SECRET,
  // determines sandbox or production endpoints used
  Constants.SYNAPSEPAY_ENVIRONMENT === 'production',
);

export default authenticationClient;
