import getClient from './client';
import * as openapi from '@dave-inc/identity-api-client';
import { moment } from '@dave-inc/time-lib';

export async function hasNeverRunSocureKyc(userId: number): Promise<boolean> {
  const client = getClient();
  const { data } = await client.getUser(userId);
  return data.kycStatus.status === openapi.ApiKycCheckStatus.NeverRun;
}

export async function kycPassedCheckedAt(userId: number): Promise<moment.Moment> {
  const client = getClient();
  const { data } = await client.getUser(userId);
  let checkedAt = null;

  if (data.kycStatus.status === openapi.ApiKycCheckStatus.Passed) {
    checkedAt = moment(data.kycStatus.checkedAt);
  }
  return checkedAt;
}
