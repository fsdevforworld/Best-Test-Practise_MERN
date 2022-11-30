import * as minimist from 'minimist';

import braze from '../../src/lib/braze';
import { moment } from '@dave-inc/time-lib';
import logger from '../../src/lib/logger';

/**
 * Usage:
 *
 * ```bash
 * $ npx ts-node bin/scripts/braze-track-event.ts \
 *       --eventName "karen won the running competition again" \
 *       --userId 10
 * ```
 *
 * With JSON properties:
 *
 * ```bash
 * $ npx ts-node bin/scripts/braze-track-event.ts \
 *       --eventName "karen won the running competition AGAIN" \
 *       --userId 10 \
 *       --properties '{
 *         "distance": "infinite"
 *       }'
 * ```
 */
function main() {
  const params = minimist(process.argv.slice(2), { string: ['eventName', 'properties', 'userId'] });

  const { eventName = '', properties = '{}', userId = '' } = params;

  if (!eventName || !userId || !Number.isInteger(parseInt(userId, 10))) {
    throw new Error('Must provide "--eventName [string]" and "--userId [int]"');
  }

  const parsedProperties = JSON.parse(properties);

  return braze.track({
    events: [
      {
        name: eventName,
        externalId: userId,
        properties: parsedProperties,
        time: moment(),
      },
    ],
  });
}

if (require.main === module) {
  main()
    .then(() => process.exit())
    .catch(error => {
      logger.error('Error in script', { error });
      process.exit(1);
    });
}
