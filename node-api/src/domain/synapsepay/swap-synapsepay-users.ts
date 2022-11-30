import { NotFoundError } from '../../lib/error';
import { SynapsepayDocument, User } from '../../models';
import Constants from './constants';
import getAgent from './get-agent';
import getUserHeader from './get-user-header';

async function swapSynapsepayUsers(
  synapsepayUserIdToClose: string,
  synapsePayUserIdToOpen: string,
) {
  const synapsepayDocToClose = await SynapsepayDocument.findOne({
    where: { synapsepayUserId: synapsepayUserIdToClose },
    include: [{ model: User, paranoid: false }],
    paranoid: false,
  });

  const userToClose = await synapsepayDocToClose.user;

  if (!userToClose) {
    throw new NotFoundError(`User with synapsepayId "${synapsepayUserIdToClose}" not found`);
  }

  const userHeader = await getUserHeader(userToClose, {
    synapsepayUserId: synapsepayUserIdToClose,
  });
  const agent = getAgent().set(userHeader);

  const url = `${Constants.SYNAPSEPAY_HOST_URL}/v3.1/users/${synapsepayUserIdToClose}/swap-duplicate-users`;

  return agent.patch(url).send({ swap_to_user_id: synapsePayUserIdToOpen });
}

export default swapSynapsepayUsers;
