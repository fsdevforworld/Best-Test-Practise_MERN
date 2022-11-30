import { DashboardNotePriority } from '../../../../models';
import { serializeDate } from '../../../../serialization';
import serialize from '../serialize';
import INotePriorityResource from './i-note-priority-resource';

const serializeNotePriority: serialize<DashboardNotePriority, INotePriorityResource> = async (
  notePriority: DashboardNotePriority,
) => {
  return {
    id: notePriority.code,
    type: 'dashboard-note-priority',
    attributes: {
      created: serializeDate(notePriority.created),
      displayName: notePriority.displayName,
      ranking: notePriority.ranking,
      updated: serializeDate(notePriority.updated),
    },
  };
};

export default serializeNotePriority;
