import { AdminComment } from '../../../../models';
import { serializeDate } from '../../../../serialization';
import serialize from '../serialize';
import INoteResource from './i-note-resource';

const serializeAdminComment: serialize<AdminComment, INoteResource> = async adminComment => {
  const internalUser = adminComment.author || (await adminComment.getAuthor({ paranoid: false }));

  return {
    id: `admin-comment-${adminComment.id}`,
    type: 'dashboard-note',
    attributes: {
      created: serializeDate(adminComment.created),
      internalUserEmail: internalUser.email,
      note: adminComment.message,
      noteType: 'Account note',
      updated: null,
      zendeskTicketUrl: null,
    },
    relationships: {
      user: { data: { id: `${adminComment.userId}`, type: 'user' } },
      dashboardNotePriority: {
        data: {
          id: `${adminComment.getDashboardNotePriorityCode()}`,
          type: 'dashboard-note-priority',
        },
      },
    },
  };
};

export default serializeAdminComment;
