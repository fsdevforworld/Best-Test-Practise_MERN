import { LoginTicket } from 'google-auth-library';
import logger from '../../../lib/logger';
import { InternalUser } from '../../../models';
import oauth2Client, { clientId } from '../lib/google-oauth2-client';

export default async function getUserFromOauthToken(token: string): Promise<InternalUser> {
  let ticket: LoginTicket;
  try {
    ticket = await oauth2Client.verifyIdToken({
      idToken: token,
      audience: clientId,
    });
  } catch (error) {
    logger.error('Error verifyingIdToken', { error });
    return null;
  }

  const { email } = ticket.getPayload();

  const internalUser = await InternalUser.findOne({
    where: {
      email,
    },
  });

  return internalUser;
}
