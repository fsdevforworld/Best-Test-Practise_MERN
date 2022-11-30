import promotionsClient from '@dave-inc/promotions-client';
import { createUser } from '../../utils';
import { User } from '../../../../src/models';
import { deleteDataForUser } from '../../delete-user';
import { runSeedAsScript } from '../utils';

/*
  Since the promotion client is tied to staging the user might
  have more prmotions than the one created in this seed. Not a
  reliable seed for automated tests yet.
*/
async function up() {
  const user = await createUser({
    firstName: 'Promotion',
    lastName: 'Seed',
  });

  await promotionsClient.createSegmentUser(
    {
      userId: user.id,
      segmentId: 'JASON_DERULO_DD_PROMO',
    },
    { Authorization: 'Basic NDc1Mzg1OjQ3NTM4NQ==' },
  );
}

async function down() {
  const user = await User.findOne({
    where: {
      firstName: 'Promotion',
      lastName: 'Seed',
    },
  });

  if (user) {
    await deleteDataForUser(user);
  }
}

export { up, down };

if (require.main === module) {
  runSeedAsScript(up, down);
}
