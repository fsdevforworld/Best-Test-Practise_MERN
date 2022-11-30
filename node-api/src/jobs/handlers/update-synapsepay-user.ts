import { User } from '../../models';
import { upsertSynapsePayUser } from '../../domain/synapsepay';
import { dogstatsd } from '../../lib/datadog-statsd';
import { SynapsePayUserUpdateFields } from 'synapsepay';
import { get, omitBy, isEmpty, isNil } from 'lodash';
import { UpdateSynapsePayUserPayload } from '../data';
import logger from '../../lib/logger';

export async function updateSynapsePayUser({ userId, options }: UpdateSynapsePayUserPayload) {
  const user = await User.findByPk(userId);
  if (!user) {
    dogstatsd.increment('update_synapsepay_users.user_not_found');
    return;
  }

  const shouldUpdate = hasUpdateableFields(user, get(options, 'fields'));
  const logObj = {
    jobName: 'UpdateSynapsePayUser',
    fields: get(options, 'fields'),
    userId,
    shouldUpdate,
  };
  if (shouldUpdate) {
    dogstatsd.increment('update_synapsepay_users.task_started');
    try {
      await upsertSynapsePayUser(user, get(options, 'ip'), get(options, 'fields'));
    } catch (e) {
      dogstatsd.increment('update_synapsepay_user.error.upsert');
      logger.error('Error upserting synapse user', { ...logObj, error: e });
      throw e;
    }
    dogstatsd.increment('update_synapsepay_user.task_complete');
  }
  logger.info('UpdateSynapsePayUser', { logObj });
}

function hasUpdateableFields(user: User, fields: SynapsePayUserUpdateFields): boolean {
  const fieldsWithValues = omitBy(fields, isNil);
  const isPhoneUpdate = !fields;
  const isOtherUpdate = fields && !isEmpty(fieldsWithValues);
  return user.synapsepayId && (isPhoneUpdate || isOtherUpdate);
}
