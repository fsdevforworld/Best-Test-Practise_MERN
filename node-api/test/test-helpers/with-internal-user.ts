import * as request from 'supertest';
import createInternalUser, { ICreateInternalUserOptions } from './create-internal-user';
import stubGoogleAuth from './stub-google-auth';
import { InternalUser } from '../../src/models';

export default async function withInternalUser(
  req: request.Test,
  options?: ICreateInternalUserOptions | InternalUser,
) {
  const internalUser = isInternalUser(options) ? options : await createInternalUser(options);

  const { idToken, sandbox } = stubGoogleAuth(internalUser.email);

  return req
    .set('Authorization', idToken)
    .then(res => res)
    .finally(() => sandbox.restore());
}

function isInternalUser(options: unknown): options is InternalUser {
  return options instanceof InternalUser;
}
