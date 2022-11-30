import * as Bluebird from 'bluebird';
import { isProdEnv } from '../lib/utils';
import mxClient from '../lib/mx';
import { MxConnectWidgetRequestBody, MxConnectionStatus } from '../typings';
import { BankConnection, User } from '../models';

export default {
  generateMxConnectionUrl,
};

type FormattedMxMember = {
  aggregatedAt: string;
  guid: string;
  name: string;
  connectionStatus: MxConnectionStatus;
  isConnected: boolean;
};

type GenerateMxConnectionUrlOptions = {
  bankConnectionId?: number;
  mxInstitutionCode?: string;
};

/**
 * Generates a unique Mx bank connect widget url: https://atrium.mx.com/docs#mx-connect-widget
 * Requires a user to have an associated Mx user object, this method will handle mx user creation if not already set
 *
 * @param {User} user
 * @param {string} bankConnectionId
 * @param {string} mxInstitutionCode
 * @returns {Promise<{url: string, members: Array<{createdAt: string, guid: string, name: string, isConnected: boolean}>}>}
 */
async function generateMxConnectionUrl(
  user: User,
  { bankConnectionId, mxInstitutionCode }: GenerateMxConnectionUrlOptions = {},
): Promise<string> {
  await createMxUser(user);
  let members: FormattedMxMember[] = [];
  if (!bankConnectionId) {
    members = await getMxMembers(user);
  }
  const connectWidgetOptions = await getMxConnectWidgetOptions(
    user,
    mxInstitutionCode,
    bankConnectionId,
    members,
  );

  const { body: getConnectWidgetResponse } = await mxClient.connectWidget.getConnectWidget(
    user.mxUserId,
    connectWidgetOptions,
  );

  return getConnectWidgetResponse.user.connectWidgetUrl;
}

async function getMxConnectWidgetOptions(
  user: User,
  mxInstitutionCode: string,
  bankConnectionId: number,
  members: FormattedMxMember[],
): Promise<MxConnectWidgetRequestBody> {
  let connectWidgetOptions: MxConnectWidgetRequestBody = {
    isMobileWebview: false,
    uiMessageVersion: 4,
    currentInstitutionCode: mxInstitutionCode,
  };

  if (bankConnectionId) {
    connectWidgetOptions = await getReconnectWidgetOptions(
      user,
      bankConnectionId,
      connectWidgetOptions,
    );
  } else {
    connectWidgetOptions = getRecentAttemptedMemberOptions(members, connectWidgetOptions);
  }

  return connectWidgetOptions;
}

function getRecentAttemptedMemberOptions(
  members: FormattedMxMember[],
  connectWidgetOptions: MxConnectWidgetRequestBody,
): MxConnectWidgetRequestBody {
  // scenario in onboarding where user needs context of the last mx member created
  const recentAttemptedMember = members
    .filter(({ isConnected }) => !isConnected)
    .sort((memberA, memberB) =>
      new Date(memberB.aggregatedAt) > new Date(memberA.aggregatedAt) ? 1 : -1,
    )[0];

  if (recentAttemptedMember) {
    return {
      ...connectWidgetOptions,
      currentMemberGuid: recentAttemptedMember.guid,
      updateCredentials: recentAttemptedMember.connectionStatus !== MxConnectionStatus.Challenged,
    };
  } else {
    return connectWidgetOptions;
  }
}

async function getReconnectWidgetOptions(
  user: User,
  bankConnectionId: number,
  connectWidgetOptions: MxConnectWidgetRequestBody,
): Promise<MxConnectWidgetRequestBody> {
  const connection = await BankConnection.findByPk(bankConnectionId);
  const mxMemberConnectionStatus = await getMxMemberConnectionStatus(user, connection.externalId);
  return {
    ...connectWidgetOptions,
    currentMemberGuid: connection.externalId,
    updateCredentials: mxMemberConnectionStatus !== MxConnectionStatus.Challenged,
    disableInstitutionSearch: true,
  };
}

async function createMxUser(user: User): Promise<void> {
  if (!user.mxUserId) {
    const { body: createUserResponse } = await mxClient.users.createUser({
      user: {
        metadata: JSON.stringify({ user_id: user.id }),
        // In production set the unique identifier as the user id
        identifier: isProdEnv() ? user.id.toString() : null,
      },
    });

    await user.update({ mxUserId: createUserResponse.user.guid });
  }
}

async function getMxMemberConnectionStatus(
  user: User,
  memberGuid: string,
): Promise<MxConnectionStatus> {
  const { body: memberStatus } = await mxClient.members.readMemberStatus(memberGuid, user.mxUserId);
  return memberStatus.member.connectionStatus as MxConnectionStatus;
}

async function getMxMembers(user: User): Promise<FormattedMxMember[]> {
  const { body: listMembersResponse } = await mxClient.members.listMembers(user.mxUserId);
  return Bluebird.map(listMembersResponse.members, async member => {
    const connectionStatus = member.connectionStatus as MxConnectionStatus;
    return {
      aggregatedAt: member.aggregatedAt,
      guid: member.guid,
      name: member.name,
      connectionStatus,
      isConnected: Boolean(await BankConnection.getOneByExternalId(member.guid)),
    };
  });
}
