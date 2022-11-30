import logger from '../../lib/logger';
import { SynapsepayDocument } from '../../models';
import Constants from './constants';
import getAgent from './get-agent';
import getUserHeader from './get-user-header';

interface IDuplicateUserDetails {
  closedUserIds: string[];
  openUserIds: string[];
  lockedUserIds: string[];
}

async function getDuplicateSynapsepayUserIds(
  document: SynapsepayDocument,
): Promise<IDuplicateUserDetails> {
  const user = document.user || (await document.getUser({ paranoid: false }));
  const { synapsepayUserId } = document;

  let userHeader;
  try {
    userHeader = await getUserHeader(user, { synapsepayUserId });
  } catch (err) {
    logger.error('Error setting synapsepay user header', { err });
    throw err;
  }

  const agent = getAgent().set(userHeader);

  const url = `${Constants.SYNAPSEPAY_HOST_URL}/v3.1/users/${synapsepayUserId}/get-duplicates`;

  let res;
  try {
    res = await agent.get(url);
  } catch (err) {
    logger.error('Error fetching duplicates from synapsepay', { err });
    throw err;
  }

  const { closed_users_id = [], locked_users_id = [], open_users_id = [] } = res.body;

  const excludeOriginalUserId = (id: string) => id !== synapsepayUserId;

  const closedUserIds = closed_users_id.filter(excludeOriginalUserId);
  const lockedUserIds = locked_users_id.filter(excludeOriginalUserId);
  const openUserIds = open_users_id.filter(excludeOriginalUserId);

  return {
    closedUserIds,
    lockedUserIds,
    openUserIds,
  };
}

export default getDuplicateSynapsepayUserIds;
