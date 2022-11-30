import { DashboardNotePriority } from '../../src/models';

export default function(factory: any) {
  factory.define('dashboard-note-priority', DashboardNotePriority, {
    code: factory.sequence('DashboardNotePriority.code', (i: number) => `code-${i}`),
    ranking: factory.sequence('DashboardNotePriority.ranking', (i: number) => i + 1000),
    displayName: factory.sequence(
      'DashboardNotePriority.displayName',
      (i: number) => `Priority ${i}`,
    ),
  });
}
