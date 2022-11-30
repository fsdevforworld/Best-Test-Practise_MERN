import { DashboardUserNote } from '../../../../models';
import { serializeDate } from '../../../../serialization';
import serialize from '../serialize';
import INoteResource from './i-note-resource';

const serializeUserNote: serialize<DashboardUserNote, INoteResource> = async userNote => {
  const actionLog = userNote.dashboardActionLog || (await userNote.getDashboardActionLog());

  const [actionReason, internalUser] = await Promise.all([
    actionLog.dashboardActionReason || actionLog.getDashboardActionReason(),
    actionLog.internalUser || actionLog.getInternalUser(),
  ]);

  return {
    id: `user-note-${userNote.id}`,
    type: 'dashboard-note',
    attributes: {
      created: serializeDate(userNote.created),
      internalUserEmail: internalUser.email,
      note: actionLog.note,
      noteType: actionReason.reason,
      updated: serializeDate(userNote.updated),
      zendeskTicketUrl: actionLog.zendeskTicketUrl,
    },
    relationships: {
      user: { data: { id: `${userNote.userId}`, type: 'user' } },
      dashboardNotePriority: {
        data: { id: `${userNote.dashboardNotePriorityCode}`, type: 'dashboard-note-priority' },
      },
    },
  };
};

export default serializeUserNote;
