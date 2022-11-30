import { InvalidParametersError } from '@dave-inc/error-types';
import { getParams } from '../../../../../lib/utils';
import {
  DashboardUserNote,
  DashboardNotePriority,
  User,
  sequelize,
  DashboardActionLog,
} from '../../../../../models';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../../typings';
import { ActionLogPayload } from '../../../domain/action-log';
import { NotePriorityCode } from '../../../domain/note';
import { noteSerializers } from '../../../serializers';

interface IRequestPayload extends ActionLogPayload {
  dashboardNotePriorityCode: NotePriorityCode;
}

async function createNote(
  req: IDashboardApiResourceRequest<User, IRequestPayload>,
  res: IDashboardV2Response<noteSerializers.INoteResource, noteSerializers.INotePriorityResource>,
) {
  const internalUserId = req.internalUser.id;
  const {
    resource: { id: userId },
  } = req;

  const { dashboardNotePriorityCode, dashboardActionReasonId, zendeskTicketUrl, note } = getParams(
    req.body,
    ['dashboardNotePriorityCode', 'dashboardActionReasonId'],
    ['zendeskTicketUrl', 'note'],
  );

  if (!zendeskTicketUrl && !note) {
    throw new InvalidParametersError('Reference url or note must be present.');
  }

  const notePriority = await DashboardNotePriority.findByPk(dashboardNotePriorityCode);

  if (!notePriority) {
    throw new InvalidParametersError('Invalid note priority.');
  }

  let userNote: DashboardUserNote;

  await sequelize.transaction(async transaction => {
    const { id: dashboardActionLogId } = await DashboardActionLog.create(
      {
        dashboardActionReasonId,
        internalUserId,
        zendeskTicketUrl,
        note,
      },
      { transaction },
    );

    userNote = await DashboardUserNote.create(
      {
        userId,
        dashboardActionLogId,
        dashboardNotePriorityCode,
      },
      { transaction },
    );
  });

  const [data, included] = await Promise.all([
    noteSerializers.serializeUserNote(userNote),
    noteSerializers.serializeNotePriority(notePriority),
  ]);

  const response = {
    data,
    included: [included],
  };

  return res.send(response);
}

export default createNote;
