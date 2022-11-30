import { Incident } from '../../src/models';
import { moment } from '@dave-inc/time-lib';

export default function(factory: any) {
  factory.define('incident', Incident, {
    title: 'Jeff Was Here',
  });

  factory.extend('incident', 'activeIncident', { resolvedAt: null, deleted: null });

  factory.extend('incident', 'resolvedIncident', {
    resolvedAt: () => moment().format('YYYY-MM-DD'),
    deleted: null,
  });

  factory.extend('incident', 'deletedIncident', {
    resolvedAt: null,
    deleted: () => moment().format('YYYY-MM-DD'),
  });
}
