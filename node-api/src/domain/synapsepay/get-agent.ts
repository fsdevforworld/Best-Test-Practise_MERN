import { helpers } from './external-model-definitions';
import * as superagent from 'superagent';
import constants from './constants';

function getAgent() {
  const ipAddress = helpers.getUserIP();

  return superagent
    .agent()
    .set('X-SP-GATEWAY', `${constants.SYNAPSEPAY_CLIENT_ID}|${constants.SYNAPSEPAY_SECRET}`)
    .set('X-SP-USER-IP', ipAddress);
}

export default getAgent;
