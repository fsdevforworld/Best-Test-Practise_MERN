import { InternalUser } from '../../../../src/models';

async function findOrCreateAgent(email: string = 'agent-seed@dave.com') {
  const [internalUser] = await InternalUser.findCreateFind({
    where: {
      email,
    },
  });

  return internalUser;
}

export default findOrCreateAgent;
