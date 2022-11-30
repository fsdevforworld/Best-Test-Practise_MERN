import * as config from 'config';
import * as req from 'superagent';
import { BrazeError } from '../../src/lib/error';

type BrazeGetUserResponse = {
  body: {
    users: [
      {
        [key: string]: string;
      },
    ];
    message: string;
  };
};

export default async function getBrazeUserData(
  externalIds: string[],
  exportFields?: string[],
): Promise<BrazeGetUserResponse> {
  const BRAZE_URL = config.get('braze.trackUrl');
  const BRAZE_KEY = config.get('braze.key');
  const url = `${BRAZE_URL}/users/export/ids`;

  const requestPayload = {
    api_key: BRAZE_KEY,
    external_ids: externalIds,
    fields_to_export: exportFields || [
      'first_name',
      'last_name',
      'email',
      'phone',
      'home_city',
      'dob',
      'country',
    ],
  };
  const response = await req.post(url).send(requestPayload);

  if (response.body.errors) {
    throw new BrazeError('Some messages failed', {
      data: { errors: response.body.errors },
      failingService: 'braze',
      gatewayService: 'node-api',
    });
  }

  return response;
}
