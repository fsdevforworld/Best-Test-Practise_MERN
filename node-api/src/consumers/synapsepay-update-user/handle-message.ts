import { Message } from '@google-cloud/pubsub';
import * as config from 'config';
import { get } from 'lodash';
import { UserWebhookData } from 'synapsepay';
import { dogstatsd } from '../../lib/datadog-statsd';
import { RateLimiter } from '../../lib/rate-limiter';
import Constants from '../../domain/synapsepay/constants';
import log from './log';
import * as ProcessUpdate from './process-user-update';
import logger from '../../lib/logger';
import * as Pubsub from '@dave-inc/pubsub';

const subscription = config.get('pubsub.synapsepay.updateUser.subscriptionName');

export async function handleMessage(message: Message, data: UserWebhookData) {
  try {
    const synapseUserId = data._id.$oid;
    log(logger.info, 'ProcessSynapsePayUserUpdate started', synapseUserId, { data });
    const userUpdateLimiter = new RateLimiter('synapseUserUpdate', [{ interval: 600, limit: 50 }]);

    const isRateLimited = await userUpdateLimiter.isRateLimited(synapseUserId);
    if (isRateLimited) {
      dogstatsd.event('Synapse sending too many webhooks for user', synapseUserId, {
        alert_type: 'warning',
      });
      message.ack();
      return;
    }

    await ProcessUpdate.processSynapsepayUserUpdate(data);
    message.ack();
    log(logger.info, 'ProcessSynapsePayUserUpdate completed', synapseUserId);
  } catch (err) {
    await handleError(err, message, data);
  }
}

async function handleError(error: any, message: Message, data: UserWebhookData) {
  let wait = 5;
  if (get(error, 'status') === Constants.SYNAPSEPAY_TOO_MANY_REQUESTS_ERROR_STATUS_CODE) {
    dogstatsd.increment('overdraft.synapsepay_update_user.too_many_requests_error');
    log(logger.info, 'Awaiting too_many_requests error', data._id.$oid, { error });
    wait = 60;
  } else {
    log(logger.error, error.msg, data._id.$oid, { data, error });
    dogstatsd.increment(`${subscription}.handle_message_error`);
  }

  await Pubsub.nackWithDelay(message, wait);
}
