import * as Bluebird from 'bluebird';
import { admin_directory_v1 } from 'googleapis';
import { InternalRole } from '../../../../models';
import { dogstatsd } from '../../../../lib/datadog-statsd';
import logger from '../../../../lib/logger';
import syncRole from './sync-role';

export default async function syncAllRoles(directoryClient: admin_directory_v1.Admin) {
  const roles = await InternalRole.findAll();

  const results = await Bluebird.map(roles, async role => {
    let outcome;
    try {
      await syncRole(role, directoryClient);
      outcome = 'success';
    } catch (error) {
      outcome = 'failed';

      dogstatsd.event('Internal role sync with GSuite failed', role.name, {
        alert_type: 'warning',
      });

      logger.error(`Error syncing ${role.name} role`, { error });
    }

    return { roleName: role.name, outcome };
  });

  return results;
}
