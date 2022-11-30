import { createUser } from './utils';
import mx from '../../src/lib/mx';
import { UserCreateRequestBody, MemberCreateRequestBody } from 'mx-atrium/atrium';
import InsitutionHelper from '../../src/helper/institution';
import { MxIntegration } from '../../src/domain/banking-data-source';
import { BankConnection } from '../../src/models';
import * as BankingDataSync from '../../src/domain/banking-data-sync';
import { startSubscription } from '../../src/domain/subscription-billing';
import * as uuid from 'uuid/v4';
import logger from '../../src/lib/logger';

export async function up(createNewMember: boolean = false) {
  const user = await createUser({
    firstName: 'Sleepy',
    lastName: 'Bear',
    email: 'sleepy@dave.com',
    settings: { doNotDisburse: true },
  });

  let mxUserId = 'USR-ae4a10a9-bd3c-4aaa-a128-56713871b757';
  let memberGuid = 'MBR-ca1c9e8f-7ec0-43f0-b53b-41c9b1bca017';

  if (createNewMember) {
    const externalInstitutionId = 'mxbank';

    const createUserBody = new UserCreateRequestBody();
    createUserBody.user = {
      identifier: uuid(),
    };

    const mxUser = await mx.users.createUser(createUserBody);
    mxUserId = mxUser.body.user.guid;

    const createRequestBody = new MemberCreateRequestBody();
    createRequestBody.member = {
      institutionCode: externalInstitutionId,
      credentials: [
        {
          guid: 'CRD-9f61fb4c-912c-bd1e-b175-ccc7f0275cc1',
          value: 'test_atrium',
        },
        {
          guid: 'CRD-e3d7ea81-aac7-05e9-fbdd-4b493c6e474d',
          value: 'password',
        },
      ],
    };

    const memberResponse = await mx.members.createMember(mxUserId, createRequestBody);

    memberGuid = memberResponse.body.member.guid;

    logger.info('Waiting for connection to aggregate');
    let isAggregating = true;
    do {
      await new Promise(resolve => setTimeout(resolve, 3000));
      const statusResponse = await mx.members.readMemberStatus(memberGuid, mxUserId);
      const hasProcessedAccounts = statusResponse.body.member.hasProcessedAccounts;
      const hasProcessedTransactions = statusResponse.body.member.hasProcessedTransactions;
      isAggregating = !(hasProcessedAccounts && hasProcessedTransactions);
      logger.info('.');
    } while (isAggregating);
  }

  await user.update({ mxUserId });

  const nexus = await new MxIntegration(user.mxUserId, memberGuid).getNexus();
  const institution = await InsitutionHelper.findOrCreateMxInstitution(
    nexus.externalInstitutionId,
    user.mxUserId,
  );

  const connection = await BankConnection.create({
    externalId: nexus.externalId,
    authToken: nexus.authToken,
    userId: user.id,
    institutionId: institution.id,
    bankingDataSource: 'MX',
  });

  await BankingDataSync.createBankAccounts(connection, user);

  await startSubscription(user);
}
