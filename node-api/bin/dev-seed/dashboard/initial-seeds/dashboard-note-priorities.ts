import { DashboardNotePriority } from '../../../../src/models';
import { NotePriorityCode } from '../../../../src/services/internal-dashboard-api/domain/note';

const notePriorities = [
  { code: NotePriorityCode.Default, ranking: 0, displayName: 'Default' },
  { code: NotePriorityCode.High, ranking: 10, displayName: 'High' },
];

function up() {
  return DashboardNotePriority.bulkCreate(notePriorities, { updateOnDuplicate: ['code'] });
}

async function down() {
  return DashboardNotePriority.destroy({
    truncate: true,
  });
}

export { notePriorities as notePrioritySeeds, up, down };
