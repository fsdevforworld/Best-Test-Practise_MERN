import { moment, MOMENT_FORMATS } from '@dave-inc/time-lib';
import { Op } from 'sequelize';
import { ACTIVE_TIMESTAMP } from '../../../../lib/sequelize';
import {
  DashboardActionLog,
  DashboardActionLogDeleteRequest,
  DashboardUserModification,
  DeleteRequest,
} from '../../../../models';
import { serializeDate } from '../../../../serialization';
import { ActionCode } from '../../domain/action-log';
import ChangelogEntryDetail from './changelog-entry-detail';
import IChangelogEntryResource from './i-changelog-entry-resource';
import serializeActionLogDetail from './serialize-action-log-detail';

async function serializeDeleteRequest(
  deleteRequest: DeleteRequest,
): Promise<IChangelogEntryResource> {
  const [actionLogDeleteRequest, user, newerDeleteRequestCount, coolOffWaives] = await Promise.all([
    DashboardActionLogDeleteRequest.findOne({
      where: {
        deleteRequestId: deleteRequest.id,
      },
      include: [{ model: DashboardActionLog.scope('withRelated') }],
    }),
    deleteRequest.getUser({ paranoid: false }),
    DeleteRequest.count({
      where: {
        userId: deleteRequest.userId,
        created: { [Op.gt]: deleteRequest.created },
      },
    }),
    DashboardUserModification.scope([
      { method: ['forActionCodes', ActionCode.CoolOffPeriodWaive] },
    ]).findAll({
      where: {
        userId: deleteRequest.userId,
      },
    }),
  ]);

  const actionLog = actionLogDeleteRequest?.dashboardActionLog;

  const details: ChangelogEntryDetail[] = [
    {
      type: 'field',
      attributes: {
        name: 'closed request date',
        value: serializeDate(deleteRequest.created, MOMENT_FORMATS.YEAR_MONTH_DAY),
        dataType: 'date',
      },
    },
  ];

  const closeSuccessful = user.deleted.isBefore(ACTIVE_TIMESTAMP) && newerDeleteRequestCount === 0;
  const neverHadCoolOffPriod = user.overrideSixtyDayDelete && coolOffWaives.length === 0;

  if (closeSuccessful) {
    details.push({
      type: 'field',
      attributes: {
        name: neverHadCoolOffPriod ? 'cool-off period' : 'cool-off period ends',
        value: neverHadCoolOffPriod
          ? 'None'
          : serializeDate(moment(user.deleted).add(60, 'days'), MOMENT_FORMATS.YEAR_MONTH_DAY),
        dataType: neverHadCoolOffPriod ? 'string' : 'date',
      },
    });
  }

  if (actionLog) {
    const serializedActionLog = await serializeActionLogDetail(actionLog);
    details.push(serializedActionLog);
  } else {
    details.push({
      type: 'field',
      attributes: {
        name: 'reason',
        value: deleteRequest.reason,
      },
    });
  }

  const priority: 'high' | 'medium' | 'low' = (() => {
    if (!closeSuccessful) {
      return 'low';
    }

    if (coolOffWaives.length > 0) {
      return 'medium';
    }

    const daysDeleted = moment().diff(moment(user.deleted), 'days');

    if (daysDeleted >= 60 || user.overrideSixtyDayDelete) {
      return 'medium';
    }

    return 'high';
  })();

  return {
    id: `delete-request-${deleteRequest.id}`,
    type: 'changelog-entry',
    attributes: {
      title: 'Closed account',
      initiator: actionLog ? 'agent' : 'user',
      status: closeSuccessful ? 'CLOSED' : 'CLOSE FAILED',
      priority,
      occurredAt: serializeDate(deleteRequest.created),
      details,
    },
  };
}

export default serializeDeleteRequest;
