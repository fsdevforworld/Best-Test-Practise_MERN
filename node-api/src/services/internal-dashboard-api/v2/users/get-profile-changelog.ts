import { flatten } from 'lodash';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import {
  DashboardUserModification,
  User,
  DashboardActionLogEmailVerification,
} from '../../../../models';
import { changelogSerializers, serializeMany } from '../../serializers';
import { UserProfileModificationActionCodes } from '../../domain/action-log';

async function getProfileChangelog(
  req: IDashboardApiResourceRequest<User>,
  res: IDashboardV2Response<changelogSerializers.IChangelogEntryResource[]>,
) {
  const { id: userId } = req.resource;

  const [modifications, dashboardEmailVerifications] = await Promise.all([
    DashboardUserModification.scope([
      { method: ['forActionCodes', UserProfileModificationActionCodes] },
    ]).findAll({
      where: {
        userId,
      },
    }),
    DashboardActionLogEmailVerification.scope([
      'withActionLog',
      { method: ['forUserId', userId] },
    ]).findAll(),
  ]);

  const data = await Promise.all([
    serializeMany(modifications, changelogSerializers.serializeModification),
    serializeMany(dashboardEmailVerifications, changelogSerializers.serializeEmailVerification),
  ]);

  res.send({
    data: flatten(data),
  });
}

export default getProfileChangelog;
