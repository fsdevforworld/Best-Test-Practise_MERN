import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import {
  User,
  MembershipPause,
  DeleteRequest,
  DashboardUserModification,
} from '../../../../models';
import { changelogSerializers, serializeMany } from '../../serializers';
import { flatten, sortBy } from 'lodash';
import { ActionCode } from '../../domain/action-log';

async function getMembershipChangelog(
  req: IDashboardApiResourceRequest<User>,
  res: IDashboardV2Response<changelogSerializers.IChangelogEntryResource[]>,
) {
  const { resource: user } = req;
  const [membershipPauses, deleteRequests, coolOffWaives] = await Promise.all([
    MembershipPause.findAll({ where: { userId: user.id } }),
    DeleteRequest.findAll({ where: { userId: user.id } }),
    DashboardUserModification.scope([
      { method: ['forActionCodes', ActionCode.CoolOffPeriodWaive] },
    ]).findAll({
      where: {
        userId: user.id,
      },
    }),
  ]);

  const [
    coolOffWaiveEntries,
    deleteRequestEntries,
    membershipPauseEntries,
    signUpEntry,
  ] = await Promise.all([
    serializeMany(coolOffWaives, changelogSerializers.serializeCoolOffWaive),
    serializeMany(deleteRequests, changelogSerializers.serializeDeleteRequest),
    serializeMany(membershipPauses, changelogSerializers.serializeMembershipPause).then(flatten),
    changelogSerializers.serializeAccountActivation({
      id: `sign-up-${user.id}`,
      activatedAt: user.created,
    }),
  ]);

  const data = sortBy(
    [...coolOffWaiveEntries, ...deleteRequestEntries, ...membershipPauseEntries, signUpEntry],
    entry => entry.attributes.occurredAt,
  ).reverse();

  res.send({ data });
}

export default getMembershipChangelog;
