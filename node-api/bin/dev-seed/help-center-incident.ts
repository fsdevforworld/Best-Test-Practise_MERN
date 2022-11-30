import * as path from 'path';

import { createUser, createInternalUser } from './utils';
import factory from '../../test/factories';
import { Incident, UserIncident, User, InternalUser } from '../../src/models';
import { deleteUser } from './delete-user';

async function up(phoneNumberSeed: string = '900') {
  const user = await createUser({
    email: `incident-${phoneNumberSeed}@dave.com`,
    phoneNumber: `+1${phoneNumberSeed}1234444`,
    firstName: path.basename(__filename).split('.')[0],
    lastName: 'incident creator',
    settings: { doNotDisburse: true },
  });

  const internalUser = await createInternalUser(`incident-${phoneNumberSeed}-internal@dave.com`);

  // @ts-ignore publicIncident is not used, but I need it so I can capture privateIncident
  const [publicIncident, privateIncident] = await Promise.all([
    makeIncident(
      'Connections with Chase Accounts',
      'We know there are some widespread issues with Chase bank account connections currently, and we are actively looking into a fix. There’s no need to contact us if this is related to what you need help with, we’re currently working on a fix. Thank you for your patience!',
      true,
      internalUser.id,
    ),
    makeIncident(
      'Advance Disbursement Is Down',
      'We know there are some widespread issues with advance disbursement currently, and we are actively looking into a fix. There’s no need to contact us if this is related to what you need help with, we’re currently working on a fix. Thank you for your patience!',
      false,
      internalUser.id,
    ),
  ]);

  await Promise.all([
    factory.create('user-incident', {
      incidentId: privateIncident.id,
      userId: user.id,
    }),
  ]);
}

async function down(phoneNumberSeed: string = '900') {
  const phoneNumber = `+1${phoneNumberSeed}1234444`;
  const incidentCreatorEmail = `incident-${phoneNumberSeed}-internal@dave.com`;

  const userIncident = await UserIncident.findOne({
    include: [
      Incident,
      {
        model: User,
        where: {
          phoneNumber,
        },
      },
    ],
  });

  const incidentCreator = await InternalUser.findOne({
    where: {
      email: incidentCreatorEmail,
    },
    attributes: ['id'],
  });

  await Incident.destroy({
    where: {
      creatorId: incidentCreator.id,
    },
    force: true,
  });

  if (userIncident) {
    await userIncident.incident.destroy({ force: true });
  }

  await deleteUser(`+1${phoneNumberSeed}1234444`);
}

async function makeIncident(
  title: string,
  description: string,
  isPublic: boolean,
  internalUserId: number,
): Promise<Incident> {
  return factory.create('incident', {
    title,
    description,
    isPublic,
    creatorId: internalUserId,
  });
}

export { up, down };
