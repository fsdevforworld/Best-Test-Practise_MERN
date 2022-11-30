import { moment } from '@dave-inc/time-lib';
import { User } from '../../../../src/models';
import * as Faker from 'faker';
import {
  upsertSynapsePayUser,
  _patchSynapsePayUser,
  fetchSynapsePayUser,
  handleSynapsePayDocumentUpdate,
} from '../../../../src/domain/synapsepay';
import factory from '../../../../test/factories';
import { UpdateUserPayload } from 'synapsepay';
import logger from '../../../../src/lib/logger';

// note that these are not run as part of the dev seed script. Here's how to:
// https://www.loom.com/share/068c93403d5c4ea09bfcf77c62928672
// https://www.loom.com/share/dda05c3d531043599e19efdc90b17ae8

async function up() {
  const firstName = Faker.name.firstName();
  const lastName = Faker.name.lastName();
  const birthdate = moment(Faker.date.between('1960', '1990'));

  const open = await factory.create<User>('user', {
    synapsepayId: null,
    firstName,
    lastName,
    birthdate,
  });

  const closed = await factory.create<User>('user', {
    synapsepayId: null,
    firstName,
    lastName,
    birthdate,
  });

  const { ip } = await upsertSynapsePayUser(closed, undefined, {
    firstName,
    lastName,
    birthdate: birthdate.format('YYYY-MM-DD'),
  });

  const synapsePayUser = await fetchSynapsePayUser(closed, { ip });

  const patchPayload: UpdateUserPayload = {
    permission: 'CLOSED',
    permission_code: 'DUPLICATE_ACCOUNT',
    documents: [],
  };

  const synapseJson = (await synapsePayUser.updateAsync(patchPayload)).json;

  await handleSynapsePayDocumentUpdate(closed.id, synapseJson, patchPayload);

  // sandbox synapse silently closes all duplicate accounts (but doesn't mark them as closed) when a
  // new one is created, so we want to create this open one last to that the statuses we see in the
  // sandbox dashboard line up with the results from synaspse/user/id/get-duplicates
  await upsertSynapsePayUser(open, undefined, {
    firstName,
    lastName,
    birthdate: birthdate.format('YYYY-MM-DD'),
  });

  logger.info('created synapsepay duplicates', {
    firstName,
    lastName,
    openUserId: open.id,
    closedUserId: closed.id,
  });
}

if (require.main === module) {
  up()
    .then(() => process.exit())
    .catch(ex => logger.error(ex));
}
