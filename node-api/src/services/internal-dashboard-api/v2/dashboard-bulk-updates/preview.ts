import * as config from 'config';
import { flatten } from 'lodash';
import * as Bluebird from 'bluebird';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { DashboardBulkUpdate, User } from '../../../../../src/models';
import {
  createBulkUpdateFraudRulesForUser,
  downloadBulkUpdateCsvAsArray,
} from '../../domain/dashboard-bulk-update';
import { previewAffectedUsers, Rule } from '../../../../helper/fraud-rule';
import { dashboardBulkUpdateSerializer, serializeMany } from '../../serializers';
import logger from '../../../../lib/logger';

const bucketName = config.get('googleCloud.projectId').toString();

async function preview(
  req: IDashboardApiResourceRequest<DashboardBulkUpdate>,
  res: IDashboardV2Response<dashboardBulkUpdateSerializer.IDashboardBulkUpdateUserResource[]>,
) {
  const { inputFileUrl } = req.resource;

  const userIds = await downloadBulkUpdateCsvAsArray(bucketName, inputFileUrl);

  const usersFromDB: User[] = await User.findAll({
    where: { id: userIds },
    paranoid: false,
  });

  const errorFraudBlockedUsers = false;
  const rules = await Bluebird.map(
    usersFromDB,
    async user => {
      let fraudRules: Rule[] = [];
      try {
        fraudRules = createBulkUpdateFraudRulesForUser(user, errorFraudBlockedUsers);
      } catch (error) {
        logger.warn(`Failed creating rules for userId:${user.id}. Error Message:${error.message}`);
      }
      return fraudRules;
    },
    {
      concurrency: 10,
    },
  ).then(flatten);

  const users = await previewAffectedUsers(rules);

  const data = await serializeMany(
    users,
    dashboardBulkUpdateSerializer.serializeDashboardBulkUpdateUser,
  );

  return res.send({ data });
}

export default preview;
