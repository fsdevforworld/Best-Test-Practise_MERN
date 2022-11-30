import * as config from 'config';
import * as request from 'superagent';

import { isTestEnv } from '../../../../../lib/utils';
import { BrazeError, failingService, gatewayService } from '../errors';

const BRAZE_URL = config.get('braze.trackUrl');
const BRAZE_KEY = config.get('braze.key');

/**
 * @see {@link https://www.braze.com/docs/developer_guide/rest_api/user_data/#user-track-endpoint|Docs}
 */
export async function post(data: { [key: string]: any }) {
  if (isTestEnv()) {
    return;
  }
  const url = `${BRAZE_URL}/users/track`;
  const response = await request.post(url).send({
    api_key: BRAZE_KEY,
    ...data,
  });
  if (response.body.errors) {
    throw new BrazeError('Braze', {
      data: { errors: response.body.errors },
      failingService,
      gatewayService,
    });
  }
  return response;
}
