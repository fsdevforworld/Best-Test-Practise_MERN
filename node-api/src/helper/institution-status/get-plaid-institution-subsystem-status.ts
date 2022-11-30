import { get } from 'lodash';
import { dogstatsd } from '../../lib/datadog-statsd';
import client from '../../lib/plaid';
import redisClient from '../../lib/redis';

import { PlaidInstitutionSubsystemStatus } from '../../typings/plaid';
import logger from '../../lib/logger';

export default async function getPlaidInstitutionSubsystemStatus(
  plaidInstitutionId: string,
): Promise<PlaidInstitutionSubsystemStatus> {
  const institutionSubsystemStatusKey = `institutionSubsystemStatus:${plaidInstitutionId}`;
  const institutionSubsystemStatus = await redisClient.getAsync(institutionSubsystemStatusKey);
  let subsystemStatus = null;

  if (institutionSubsystemStatus) {
    subsystemStatus = JSON.parse(institutionSubsystemStatus);
  } else {
    dogstatsd.increment('institutions.attempted_to_get_plaid_status.cache_miss');

    try {
      const response = await client.getInstitutionById(plaidInstitutionId, {
        include_status: true,
      });
      subsystemStatus = get(response, 'institution.status');

      if (subsystemStatus) {
        await redisClient.setAsync([
          institutionSubsystemStatusKey,
          JSON.stringify(subsystemStatus),
          'EX',
          '300',
        ]);
      }
      dogstatsd.increment('institutions.attempted_to_get_plaid_status.success');
    } catch (error) {
      dogstatsd.increment('institutions.attempted_to_get_plaid_status.failed', {
        reason: 'plaid_error',
      });
      logger.error('Failed getting plaid status', { error });
    }
  }

  return subsystemStatus;
}
